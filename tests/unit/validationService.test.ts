import { describe, it, expect, beforeEach } from '@jest/globals';
import { ValidationService } from '../../src/services/validationService.js';
import type { PoBBuild, FlaskAnalysis } from '../../src/types.js';

describe('ValidationService', () => {
  let validationService: ValidationService;

  beforeEach(() => {
    validationService = new ValidationService();
  });

  describe('validateBuild', () => {
    it('should detect low fire resistance', () => {
      const build: PoBBuild = {
        Build: {
          level: '90',
          PlayerStat: [
            { stat: 'FireResist', value: '50' },
            { stat: 'ColdResist', value: '75' },
            { stat: 'LightningResist', value: '75' },
            { stat: 'Life', value: '5000' },
          ],
        },
      };

      const validation = validationService.validateBuild(build, null);
      expect(validation.criticalIssues.length).toBeGreaterThan(0);
      expect(validation.criticalIssues[0].title).toContain('Fire Resistance');
      expect(validation.criticalIssues[0].currentValue).toBe(50);
      expect(validation.criticalIssues[0].recommendedValue).toBe(75);
    });

    it('should detect low life pool', () => {
      const build: PoBBuild = {
        Build: {
          level: '90',
          PlayerStat: [
            { stat: 'FireResist', value: '75' },
            { stat: 'ColdResist', value: '75' },
            { stat: 'LightningResist', value: '75' },
            { stat: 'Life', value: '3000' }, // Too low for level 90
            { stat: 'EnergyShield', value: '0' },
          ],
        },
      };

      const validation = validationService.validateBuild(build, null);
      const lifeIssue = validation.criticalIssues.find(i => i.title.includes('Life Pool'));
      expect(lifeIssue).toBeDefined();
      expect(lifeIssue?.currentValue).toBe(3000);
      expect(lifeIssue?.recommendedValue).toBe(5500);
    });

    it('should detect ES builds correctly', () => {
      const build: PoBBuild = {
        Build: {
          level: '90',
          PlayerStat: [
            { stat: 'FireResist', value: '75' },
            { stat: 'ColdResist', value: '75' },
            { stat: 'LightningResist', value: '75' },
            { stat: 'Life', value: '1000' }, // Low life
            { stat: 'EnergyShield', value: '7000' }, // High ES = ES build
          ],
        },
      };

      const validation = validationService.validateBuild(build, null);
      // Should NOT flag life as too low (it's an ES build)
      const lifeIssue = validation.criticalIssues.find(i => i.title.includes('Life Pool'));
      expect(lifeIssue).toBeUndefined();

      // Should be valid since ES is good
      const esIssue = validation.criticalIssues.find(i => i.title.includes('Energy Shield'));
      expect(esIssue).toBeUndefined();
    });

    it('should detect missing bleed immunity', () => {
      const build: PoBBuild = {
        Build: {
          level: '90',
          PlayerStat: [
            { stat: 'FireResist', value: '75' },
            { stat: 'ColdResist', value: '75' },
            { stat: 'LightningResist', value: '75' },
            { stat: 'Life', value: '6000' },
          ],
        },
      };

      const flaskAnalysis: FlaskAnalysis = {
        totalFlasks: 5,
        activeFlasks: 1,
        flasks: [],
        flaskTypes: { life: 1, mana: 0, hybrid: 0, utility: 4 },
        hasBleedImmunity: false, // Missing!
        hasFreezeImmunity: true,
        hasPoisonImmunity: true,
        hasCurseImmunity: false,
        uniqueFlasks: [],
        warnings: [],
        recommendations: [],
      };

      const validation = validationService.validateBuild(build, flaskAnalysis);
      const bleedIssue = validation.criticalIssues.find(i => i.title.includes('Bleed'));
      expect(bleedIssue).toBeDefined();
      expect(bleedIssue?.category).toBe('immunities');
    });

    it('should detect missing freeze immunity', () => {
      const build: PoBBuild = {
        Build: {
          level: '90',
          PlayerStat: [
            { stat: 'FireResist', value: '75' },
            { stat: 'ColdResist', value: '75' },
            { stat: 'LightningResist', value: '75' },
            { stat: 'Life', value: '6000' },
          ],
        },
      };

      const flaskAnalysis: FlaskAnalysis = {
        totalFlasks: 5,
        activeFlasks: 1,
        flasks: [],
        flaskTypes: { life: 1, mana: 0, hybrid: 0, utility: 4 },
        hasBleedImmunity: true,
        hasFreezeImmunity: false, // Missing!
        hasPoisonImmunity: true,
        hasCurseImmunity: false,
        uniqueFlasks: [],
        warnings: [],
        recommendations: [],
      };

      const validation = validationService.validateBuild(build, flaskAnalysis);
      const freezeIssue = validation.criticalIssues.find(i => i.title.includes('Freeze'));
      expect(freezeIssue).toBeDefined();
    });

    it('should warn about negative chaos resistance', () => {
      const build: PoBBuild = {
        Build: {
          level: '90',
          PlayerStat: [
            { stat: 'FireResist', value: '75' },
            { stat: 'ColdResist', value: '75' },
            { stat: 'LightningResist', value: '75' },
            { stat: 'ChaosResist', value: '-30' }, // Negative!
            { stat: 'Life', value: '6000' },
          ],
        },
      };

      const validation = validationService.validateBuild(build, null);
      const chaosIssue = validation.warnings.find(i => i.title.includes('Chaos'));
      expect(chaosIssue).toBeDefined();
      expect(chaosIssue?.currentValue).toBe(-30);
    });

    it('should calculate score correctly', () => {
      const perfectBuild: PoBBuild = {
        Build: {
          level: '90',
          PlayerStat: [
            { stat: 'FireResist', value: '75' },
            { stat: 'ColdResist', value: '75' },
            { stat: 'LightningResist', value: '75' },
            { stat: 'ChaosResist', value: '20' },
            { stat: 'Life', value: '6000' },
          ],
        },
      };

      const flaskAnalysis: FlaskAnalysis = {
        totalFlasks: 5,
        activeFlasks: 1,
        flasks: [],
        flaskTypes: { life: 1, mana: 0, hybrid: 0, utility: 4 },
        hasBleedImmunity: true,
        hasFreezeImmunity: true,
        hasPoisonImmunity: true,
        hasCurseImmunity: false,
        uniqueFlasks: [],
        warnings: [],
        recommendations: [],
      };

      const validation = validationService.validateBuild(perfectBuild, flaskAnalysis);
      expect(validation.overallScore).toBeGreaterThan(8); // Should be near perfect
      expect(validation.isValid).toBe(true);
    });

    it('should give low score for broken build', () => {
      const brokenBuild: PoBBuild = {
        Build: {
          level: '90',
          PlayerStat: [
            { stat: 'FireResist', value: '30' }, // Low
            { stat: 'ColdResist', value: '40' }, // Low
            { stat: 'LightningResist', value: '50' }, // Low
            { stat: 'Life', value: '2500' }, // Very low
          ],
        },
      };

      const flaskAnalysis: FlaskAnalysis = {
        totalFlasks: 3,
        activeFlasks: 0,
        flasks: [],
        flaskTypes: { life: 0, mana: 0, hybrid: 0, utility: 3 },
        hasBleedImmunity: false,
        hasFreezeImmunity: false,
        hasPoisonImmunity: false,
        hasCurseImmunity: false,
        uniqueFlasks: [],
        warnings: [],
        recommendations: [],
      };

      const validation = validationService.validateBuild(brokenBuild, flaskAnalysis);
      expect(validation.overallScore).toBeLessThan(3);
      expect(validation.isValid).toBe(false);
      expect(validation.criticalIssues.length).toBeGreaterThan(4);
    });
  });

  describe('formatValidation', () => {
    it('should format validation output', () => {
      const build: PoBBuild = {
        Build: {
          level: '90',
          PlayerStat: [
            { stat: 'FireResist', value: '50' },
            { stat: 'ColdResist', value: '75' },
            { stat: 'LightningResist', value: '75' },
            { stat: 'Life', value: '5000' },
          ],
        },
      };

      const validation = validationService.validateBuild(build, null);
      const formatted = validationService.formatValidation(validation);

      expect(formatted).toContain('Build Validation Report');
      expect(formatted).toContain('Overall Score:');
      expect(formatted).toContain('Critical Issues');
      expect(formatted).toContain('Fire Resistance');
      expect(formatted).toContain('❌');
      expect(formatted).toContain('Suggestions:');
    });
  });
});
