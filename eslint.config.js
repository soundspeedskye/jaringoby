const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const boundaries = require('eslint-plugin-boundaries');

// FSD 레이어. 왼쪽이 아래(하위)이고, 각 레이어는 자기보다 아래만 참조할 수 있다.
// 같은 레이어끼리는 같은 슬라이스 안에서만 참조할 수 있다(슬라이스가 없는
// shared·app은 제외).
const LAYERS = ['shared', 'entities', 'features', 'widgets', 'pages', 'app'];
const SLICELESS = ['shared', 'app'];

const to = (type, captured) => ({
  to: { element: captured ? { type, captured } : { type } },
});

const layerPolicies = LAYERS.map((layer, index) => ({
  from: [{ element: { type: layer } }],
  allow: [
    ...LAYERS.slice(0, index).map((lower) => to(lower)),
    SLICELESS.includes(layer)
      ? to(layer)
      : to(layer, { slice: '{{from.slice}}' }),
  ],
}));

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: ['dist/**', 'coverage/**', '.expo/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['src/**/*'],
      // 패턴은 `**`로 끝내야 슬라이스 루트의 index.ts까지 분류된다.
      // `*/**/*`로 쓰면 한 단계 깊은 파일만 잡혀 배럴 import가 검사를 빠져나간다.
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/**' },
        { type: 'pages', pattern: 'src/pages/*/**', capture: ['slice'] },
        { type: 'widgets', pattern: 'src/widgets/*/**', capture: ['slice'] },
        { type: 'features', pattern: 'src/features/*/**', capture: ['slice'] },
        { type: 'entities', pattern: 'src/entities/*/**', capture: ['slice'] },
        { type: 'shared', pattern: 'src/shared/**' },
        // 테스트 픽스처는 레이어 밖이다. 어디서든 읽고 읽힐 수 있게 둔다.
        { type: 'testing', pattern: 'src/test/**' },
      ],
    },
    rules: {
      // 어느 레이어에도 속하지 않는 파일이 생기면 위 규칙이 그 파일을 조용히
      // 건너뛴다. 분류 누락 자체를 오류로 만들어 구멍을 막는다.
      'boundaries/no-unknown-files': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            ...layerPolicies,
            {
              from: [{ element: { type: 'testing' } }],
              allow: LAYERS.map((layer) => to(layer)),
            },
            {
              from: LAYERS.map((layer) => ({ element: { type: layer } })),
              allow: [to('testing')],
            },
          ],
        },
      ],
    },
  },
]);
