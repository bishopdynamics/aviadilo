import { describe, expect, it } from 'vitest';
import { compileFromFile } from 'json-schema-to-typescript';
import { readFile } from 'node:fs/promises';
import prettier from 'prettier';
import cases from '../../../contracts/fixtures/cases.json';
import {
  validateContract,
  type SchemaName,
} from '../../../src/config/validate';
import { CARD_DEFAULTS, normalizeConfig } from '../../../src/config/defaults';

describe('shared version 1 contracts', () => {
  for (const fixture of cases) {
    it(`${fixture.valid ? 'accepts' : 'rejects'} ${fixture.name}`, () => {
      const run = () =>
        validateContract(fixture.schema as SchemaName, fixture.value);
      if (fixture.valid) expect(run).not.toThrow();
      else expect(run).toThrow();
    });
  }
  it('rejects nonfinite numbers', () => {
    for (const radius of [NaN, Infinity, -Infinity]) {
      expect(() =>
        normalizeConfig({ ...CARD_DEFAULTS, people: { radius_m: radius } }),
      ).toThrow();
    }
  });
  it('preserves nested future fields without sharing mutable defaults', () => {
    const first = normalizeConfig({
      schema_version: 1,
      type: 'custom:aviadilo-map',
      future: { value: 1 },
      people: { future_color: 'pink' },
    });
    const second = normalizeConfig({
      schema_version: 1,
      type: 'custom:aviadilo-map',
    });
    first.people!.trackers!.push({ entity_id: 'device_tracker.synthetic' });
    first.map!.include_zones!.push('zone.synthetic');
    first.aircraft!.list_columns!.push('squawk');
    expect(second.people!.trackers).toEqual([]);
    expect(CARD_DEFAULTS.people!.trackers).toEqual([]);
    expect(second.map!.include_zones).toEqual([]);
    expect(CARD_DEFAULTS.aircraft!.list_columns).not.toContain('squawk');
    expect(normalizeConfig(first).people!.future_color).toBe('pink');
    expect(normalizeConfig(first).future).toEqual({ value: 1 });
  });
  it('keeps generated TypeScript declarations synchronized with schemas', async () => {
    for (const [schemas, output] of [
      [['card-config'], 'src/config/types.ts'],
      [['integration-config'], 'src/config/integration-types.ts'],
      [['command', 'event', 'info'], 'src/data/types.ts'],
    ] as const) {
      let generated = '';
      for (const schema of schemas)
        generated += await compileFromFile(`contracts/${schema}.schema.json`, {
          additionalProperties: false,
          declareExternallyReferenced: true,
          maxItems: -1,
        });
      const options = {
        ...(await prettier.resolveConfig(output)),
        filepath: output,
      };
      expect(await prettier.format(generated, options)).toBe(
        await readFile(output, 'utf8'),
      );
    }
  });
});
