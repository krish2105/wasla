import { spanIsGrounded } from '../pdf.js';
import type { Task } from './registry.js';

/**
 * A value the model claims to have read out of the resume, paired with the
 * span it read it from. `evidence` is checked against the extracted PDF text
 * before the value is shown; a claim whose span is not in the source is
 * dropped and counted.
 */
function grounded(type: 'string' | 'number' | 'boolean'): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      value: { type: [type, 'null'] },
      evidence: {
        type: 'string',
        description:
          'The exact text from the resume this value was read from. Copy it verbatim. ' +
          'If the resume does not state it, set value to null and evidence to "".',
      },
    },
    required: ['value', 'evidence'],
    additionalProperties: false,
  };
}

const VISA_STATUSES = [
  'citizen',
  'transferable',
  'non_transferable',
  'golden',
  'student',
  'needs_sponsorship',
  'outside_gcc',
] as const;

/**
 * Two kinds of claim, kept apart on purpose.
 *
 * `extracted` fields assert something the resume says, and each carries an
 * evidence span that code verifies is a literal substring of the source --
 * CLAUDE.md invariant 4.
 *
 * `generated` fields are written by the model. A headline and a summary are
 * compositions, not quotations, so demanding a verbatim span for them would be
 * incoherent. They are separated in the schema so nobody can mistake one for
 * the other, and the UI labels them as drafted rather than found.
 */
const schema: Record<string, unknown> = {
  type: 'object',
  properties: {
    extracted: {
      type: 'object',
      properties: {
        full_name: grounded('string'),
        years_exp: grounded('number'),
        location_city: grounded('string'),
        open_to_relocate: grounded('boolean'),
        visa_status: {
          type: 'object',
          properties: {
            value: { type: ['string', 'null'], enum: [...VISA_STATUSES, null] },
            evidence: { type: 'string' },
          },
          required: ['value', 'evidence'],
          additionalProperties: false,
        },
        skills: {
          type: 'array',
          items: grounded('string'),
          description: 'One entry per distinct skill named in the resume.',
        },
      },
      required: [
        'full_name',
        'years_exp',
        'location_city',
        'open_to_relocate',
        'visa_status',
        'skills',
      ],
      additionalProperties: false,
    },
    generated: {
      type: 'object',
      properties: {
        headline: { type: ['string', 'null'] },
        summary: { type: ['string', 'null'] },
      },
      required: ['headline', 'summary'],
      additionalProperties: false,
    },
  },
  required: ['extracted', 'generated'],
  additionalProperties: false,
};

export const extractResume: Task = {
  name: 'extract_resume',
  schemaVersion: 1,
  takesDocument: true,

  // Never cached. The value is derived from a CV, so an entry would hold
  // personal data, and a given resume is parsed once per user in practice --
  // there is no repeat traffic here to save.
  cacheTtl: 0,

  system:
    'You extract structured facts from a resume for a job-seeking profile. ' +
    'Never infer a fact the document does not support. When the resume does ' +
    'not state something, return null rather than a guess. For every extracted ' +
    'field, copy the exact text you read the value from into its evidence ' +
    'field, verbatim and unaltered. The headline and summary you may compose ' +
    'yourself from what the resume says.',

  prompt(): string {
    return (
      'Extract this resume into the required schema. ' +
      `visa_status must be one of: ${VISA_STATUSES.join(', ')}, or null if the ` +
      'resume does not say. years_exp is total years of professional experience ' +
      'as a number.'
    );
  },

  schema,

  /**
   * Drops every extracted claim whose evidence span is not actually in the
   * resume, and reports how many were dropped.
   *
   * The drop count is the point, not a side effect: it is the
   * hallucination-suppression metric the build plan wants in the README, and
   * it only means anything if it is counted rather than silently discarded.
   *
   * `generated` is passed through untouched. A composed headline has no span
   * to verify, and pretending otherwise would make the metric meaningless.
   */
  postprocess(parsed: unknown, sourceText: string) {
    const doc = parsed as {
      extracted?: Record<string, unknown>;
      generated?: unknown;
    };
    const extracted = doc.extracted ?? {};
    let droppedClaims = 0;

    const keep = (claim: unknown): boolean => {
      const c = claim as { value?: unknown; evidence?: unknown };
      if (c?.value === null || c?.value === undefined) return false;
      const evidence = typeof c.evidence === 'string' ? c.evidence : '';
      if (spanIsGrounded(evidence, sourceText)) return true;
      droppedClaims++;
      return false;
    };

    const clean: Record<string, unknown> = {};
    for (const [field, claim] of Object.entries(extracted)) {
      if (field === 'skills') {
        const skills = Array.isArray(claim) ? claim : [];
        clean.skills = skills.filter(keep);
        continue;
      }
      if (keep(claim)) clean[field] = claim;
    }

    return {
      value: { extracted: clean, generated: doc.generated ?? null },
      droppedClaims,
    };
  },
};
