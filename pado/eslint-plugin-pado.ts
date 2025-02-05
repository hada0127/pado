import { Rule } from 'eslint';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow mixed content with variable interpolation',
      category: 'Possible Errors',
      recommended: true,
    },
    schema: [],
    messages: {
      noMixedContent: 'Variable interpolation ({variable}) should not be mixed with HTML elements in the same parent element',
    },
  },

  create(context) {
    return {
      Program(node) {
        const sourceCode = context.getSourceCode().getText();
        
        // HTML 태그 내부의 콘텐츠를 검사
        const tagRegex = /<([^>]+)>([^<]+\{[^}]+\}[^<]*<[^>]+>[^<]*|[^<]*<[^>]+>[^<]*\{[^}]+\}[^<]*)<\/\1>/g;
        let match;

        while ((match = tagRegex.exec(sourceCode)) !== null) {
          context.report({
            node,
            messageId: 'noMixedContent',
            loc: {
              start: { line: sourceCode.substr(0, match.index).split('\n').length, column: 0 },
              end: { line: sourceCode.substr(0, match.index + match[0].length).split('\n').length, column: 0 }
            }
          });
        }
      }
    };
  },
};

module.exports = {
  rules: {
    'no-mixed-content': rule
  }
}; 