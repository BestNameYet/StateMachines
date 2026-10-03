const fs = require('node:fs');

const sourcePath = 'ChatMachines/GeminiSupervisor/Agents.md';
const evaluationPath = 'ChatMachines/GeminiEvaluation/evaluations/agents_projection_61200_20261003_1/evaluation.json';
const resultPath = 'ChatMachines/GitHubNodeTest/result.json';

const source = fs.readFileSync(sourcePath, 'utf8');
const evaluation = JSON.parse(fs.readFileSync(evaluationPath, 'utf8'));
const revised = evaluation.revised_projection;

if (typeof revised !== 'string') {
  throw new Error('evaluation.revised_projection is not a string');
}

const result = {
  source_utf8_bytes: Buffer.byteLength(source, 'utf8'),
  source_unicode_code_points: Array.from(source).length,
  evaluator_reported_source_character_count: evaluation.source_character_count,
  target_character_count: evaluation.target_character_count,
  evaluator_reported_revised_character_count: evaluation.revised_character_count,
  measured_revised_unicode_code_points: Array.from(revised).length,
  exact_target_match: Array.from(revised).length === 61200
};

fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
