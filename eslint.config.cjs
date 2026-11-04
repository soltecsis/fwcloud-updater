const typescriptEslintPlugin = require("@typescript-eslint/eslint-plugin");
const prettier = require("eslint-plugin-prettier");
const globals = require("globals");
const tsParser = require("@typescript-eslint/parser");
const js = require("@eslint/js");
const jest = require("eslint-plugin-jest");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = [
    ...compat.extends(
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier",
    "plugin:prettier/recommended",
), {
    plugins: {
        "@typescript-eslint": typescriptEslintPlugin,
        "prettier": prettier,
    },
    
    languageOptions: {
        globals: {
            ...globals.node,
        },
        
        parser: tsParser,
        ecmaVersion: 5,
        sourceType: "module",
        
        parserOptions: {
            project: "tsconfig.json",
        },
    },
    
    rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    // TODO: Add this rule. Reivew the codebase and fix the issues.
    '@typescript-eslint/no-unsafe-member-access': 'off',
  },
}, {
    files: ["**/*.{spec,test}.{ts,js}"],
    plugins: { jest },
    rules: {
        "jest/no-focused-tests": "error",
        // The plugin does not recognize Jest's non-parameterized concurrent.only.
        "no-restricted-syntax": ["error", {
            selector: "MemberExpression[object.type='MemberExpression'][object.object.name=/^(it|test)$/][object.property.name='concurrent']:matches([property.name='only'], [property.value='only'])",
            message: "Unexpected focused test",
        }],
    },
}];
