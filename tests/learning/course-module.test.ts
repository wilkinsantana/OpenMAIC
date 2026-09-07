import { describe, it, expect } from 'vitest';
import { planCourseModule } from '@/lib/learning/course-module';
import { validExerciseDraft } from '@/lib/learning/progress';

describe('learning enhancements', () => {
  it('appends new unique outline IDs after all existing orders', () => {
    const orders = [1, 3, 8];
    const before = [...orders];
    const result = planCourseModule({
      level: 'Advanced',
      topics: 'Concurrency\nCode review',
      resources: 'https://example.org/lesson',
      context: 'Existing foundations',
      existingOrders: orders,
    });
    expect(result.map((o) => o.order)).toEqual([9, 10]);
    expect(result[0].id).not.toBe(result[1].id);
    expect(result[0].description).toContain('https://example.org/lesson');
    expect(orders).toEqual(before);
  });
  it('rejects empty and oversized batches without producing outlines', () => {
    for (const topics of ['', Array(31).fill('Lesson').join('\n'), 'x'.repeat(301)])
      expect(() =>
        planCourseModule({
          level: 'Beginner',
          topics,
          resources: '',
          context: '',
          existingOrders: [],
        }),
      ).toThrow();
  });
  it('accepts bounded attempts and rejects malformed iframe messages', () => {
    const draft = { code: 'attempt', savedAttempt: null, assisted: false, status: 'in-progress' };
    expect(validExerciseDraft(draft)).toBe(true);
    expect(validExerciseDraft({ ...draft, code: 'x'.repeat(100001) })).toBe(false);
    expect(validExerciseDraft({ ...draft, assisted: 'yes' })).toBe(false);
    expect(validExerciseDraft({ ...draft, status: 'passed-by-ai' })).toBe(false);
  });
});
