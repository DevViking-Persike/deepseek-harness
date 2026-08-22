/**
 * Indentation rules for the languages the editor opens.
 *
 * Monaco 0.56 ships a tokenizer for every language here but `indentationRules`
 * for only five it does not (bicep, elixir, protobuf, ruby, typespec), so
 * pressing Enter fell back to bracket matching alone: a Go `case:` or a Rust
 * `match` arm did not indent. These rules are vendored verbatim from
 * microsoft/vscode's own `language-configuration.json` files, which are MIT —
 * see ThirdPartyNotices. C# is hand-authored because upstream ships none.
 *
 * Rules are data, not code: a pattern arrives either as a string or as
 * `{ pattern, flags }`, and `toRegExp` normalizes both because Monaco calls
 * `.test()` on a real RegExp.
 */

/** A pattern as VS Code writes it: a bare string, or a form with flags. */
export type RawPattern = string | { pattern: string; flags?: string }

/** One Enter-key rule: when the surrounding text matches, take this action. */
export interface RawOnEnterRule {
  beforeText: RawPattern
  afterText?: RawPattern
  previousLineText?: RawPattern
  action: { indent: string; appendText?: string; removeText?: number }
}

/** The subset of a VS Code language configuration this module carries. */
export interface RawLanguageConfig {
  indentationRules?: {
    increaseIndentPattern: RawPattern
    decreaseIndentPattern: RawPattern
    indentNextLinePattern?: RawPattern
    unIndentedLinePattern?: RawPattern
  }
  onEnterRules?: RawOnEnterRule[]
}

export const LANGUAGE_CONFIGS: Readonly<Record<string, RawLanguageConfig>> = {
  typescript: {
    'indentationRules': {
      'decreaseIndentPattern': {
        'pattern': '^\\s*[\\}\\]\\)].*$',
      },
      'increaseIndentPattern': {
        'pattern': '^.*(\\{[^}]*|\\([^)]*|\\[[^\\]]*)$',
      },
      'unIndentedLinePattern': {
        'pattern': '^(\\t|[ ])*[ ]\\*[^/]*\\*/\\s*$|^(\\t|[ ])*[ ]\\*/\\s*$|^(\\t|[ ])*\\*([ ]([^\\*]|\\*(?!/))*)?$',
      },
      'indentNextLinePattern': {
        'pattern': '^((.*=>\\s*)|((.*[^\\w]+|\\s*)((if|while|for)\\s*\\(.*\\)\\s*|else\\s*)))$',
      },
    },
    'onEnterRules': [
      {
        'beforeText': {
          'pattern': '^\\s*/\\*\\*(?!/)([^\\*]|\\*(?!/))*$',
        },
        'afterText': {
          'pattern': '^\\s*\\*/$',
        },
        'action': {
          'indent': 'indentOutdent',
          'appendText': ' * ',
        },
      },
      {
        'beforeText': {
          'pattern': '^\\s*/\\*\\*(?!/)([^\\*]|\\*(?!/))*$',
        },
        'action': {
          'indent': 'none',
          'appendText': ' * ',
        },
      },
      {
        'beforeText': {
          'pattern': '^(\\t|[ ])*\\*([ ]([^\\*]|\\*(?!/))*)?$',
        },
        'previousLineText': {
          'pattern': '(?=^(\\s*(/\\*\\*|\\*)).*)(?=(?!(\\s*\\*/)))',
        },
        'action': {
          'indent': 'none',
          'appendText': '* ',
        },
      },
      {
        'beforeText': {
          'pattern': '^(\\t|[ ])*[ ]\\*/\\s*$',
        },
        'action': {
          'indent': 'none',
          'removeText': 1,
        },
      },
      {
        'beforeText': {
          'pattern': '^(\\t|[ ])*[ ]\\*[^/]*\\*/\\s*$',
        },
        'action': {
          'indent': 'none',
          'removeText': 1,
        },
      },
      {
        'beforeText': {
          'pattern': '^\\s*(\\bcase\\s.+:|\\bdefault:)$',
        },
        'afterText': {
          'pattern': '^(?!\\s*(\\bcase\\b|\\bdefault\\b))',
        },
        'action': {
          'indent': 'indent',
        },
      },
      {
        'previousLineText': '^\\s*(((else ?)?if|for|while)\\s*\\(.*\\)\\s*|else\\s*)$',
        'beforeText': '^\\s+([^{i\\s]|i(?!f\\b))',
        'action': {
          'indent': 'outdent',
        },
      },
      {
        'beforeText': '^.*\\([^\\)]*$',
        'afterText': '^\\s*\\).*$',
        'action': {
          'indent': 'indentOutdent',
          'appendText': '\t',
        },
      },
      {
        'beforeText': '^.*\\{[^\\}]*$',
        'afterText': '^\\s*\\}.*$',
        'action': {
          'indent': 'indentOutdent',
          'appendText': '\t',
        },
      },
      {
        'beforeText': '^.*\\[[^\\]]*$',
        'afterText': '^\\s*\\].*$',
        'action': {
          'indent': 'indentOutdent',
          'appendText': '\t',
        },
      },
      {
        'beforeText': '^\\s*//\\s*\\S|\\s//\\s+\\S',
        'afterText': '^(?!\\s*$)',
        'action': {
          'indent': 'none',
          'appendText': '// ',
        },
      },
    ],
  },
  javascript: {
    'indentationRules': {
      'decreaseIndentPattern': {
        'pattern': '^\\s*[\\}\\]\\)].*$',
      },
      'increaseIndentPattern': {
        'pattern': '^.*(\\{[^}]*|\\([^)]*|\\[[^\\]]*)$',
      },
      'unIndentedLinePattern': {
        'pattern': '^(\\t|[ ])*[ ]\\*[^/]*\\*/\\s*$|^(\\t|[ ])*[ ]\\*/\\s*$|^(\\t|[ ])*\\*([ ]([^\\*]|\\*(?!/))*)?$',
      },
      'indentNextLinePattern': {
        'pattern': '^((.*=>\\s*)|((.*[^\\w]+|\\s*)((if|while|for)\\s*\\(.*\\)\\s*|else\\s*)))$',
      },
    },
    'onEnterRules': [
      {
        'beforeText': {
          'pattern': '^\\s*/\\*\\*(?!/)([^\\*]|\\*(?!/))*$',
        },
        'afterText': {
          'pattern': '^\\s*\\*/$',
        },
        'action': {
          'indent': 'indentOutdent',
          'appendText': ' * ',
        },
      },
      {
        'beforeText': {
          'pattern': '^\\s*/\\*\\*(?!/)([^\\*]|\\*(?!/))*$',
        },
        'action': {
          'indent': 'none',
          'appendText': ' * ',
        },
      },
      {
        'beforeText': {
          'pattern': '^(\\t|[ ])*\\*([ ]([^\\*]|\\*(?!/))*)?$',
        },
        'previousLineText': {
          'pattern': '(?=^(\\s*(/\\*\\*|\\*)).*)(?=(?!(\\s*\\*/)))',
        },
        'action': {
          'indent': 'none',
          'appendText': '* ',
        },
      },
      {
        'beforeText': {
          'pattern': '^(\\t|[ ])*[ ]\\*/\\s*$',
        },
        'action': {
          'indent': 'none',
          'removeText': 1,
        },
      },
      {
        'beforeText': {
          'pattern': '^(\\t|[ ])*[ ]\\*[^/]*\\*/\\s*$',
        },
        'action': {
          'indent': 'none',
          'removeText': 1,
        },
      },
      {
        'beforeText': {
          'pattern': '^\\s*(\\bcase\\s.+:|\\bdefault:)$',
        },
        'afterText': {
          'pattern': '^(?!\\s*(\\bcase\\b|\\bdefault\\b))',
        },
        'action': {
          'indent': 'indent',
        },
      },
      {
        'previousLineText': '^\\s*(((else ?)?if|for|while)\\s*\\(.*\\)\\s*|else\\s*)$',
        'beforeText': '^\\s+([^{i\\s]|i(?!f\\b))',
        'action': {
          'indent': 'outdent',
        },
      },
      {
        'beforeText': '^.*\\([^\\)]*$',
        'afterText': '^\\s*\\).*$',
        'action': {
          'indent': 'indentOutdent',
          'appendText': '\t',
        },
      },
      {
        'beforeText': '^.*\\{[^\\}]*$',
        'afterText': '^\\s*\\}.*$',
        'action': {
          'indent': 'indentOutdent',
          'appendText': '\t',
        },
      },
      {
        'beforeText': '^.*\\[[^\\]]*$',
        'afterText': '^\\s*\\].*$',
        'action': {
          'indent': 'indentOutdent',
          'appendText': '\t',
        },
      },
      {
        'beforeText': '^\\s*//\\s*\\S|\\s//\\s+\\S',
        'afterText': '^(?!\\s*$)',
        'action': {
          'indent': 'none',
          'appendText': '// ',
        },
      },
    ],
  },
  go: {
    'indentationRules': {
      'increaseIndentPattern': "^.*(\\bcase\\b.*:|\\bdefault\\b:|(\\b(func|if|else|switch|select|for|struct)\\b.*)?{[^}\"'`]*|\\([^)\"'`]*)$",
      'decreaseIndentPattern': '^\\s*(\\bcase\\b.*:|\\bdefault\\b:|}[)}]*[)]?|\\)[]?)$',
    },
    'onEnterRules': [
      {
        'beforeText': '^\\s*//\\s*\\S|\\s//\\s+\\S',
        'afterText': '^(?!\\s*$)',
        'action': {
          'indent': 'none',
          'appendText': '// ',
        },
      },
    ],
  },
  rust: {
    'indentationRules': {
      'increaseIndentPattern': "^.*\\{[^}\"']*$|^.*\\([^\\)\"']*$",
      'decreaseIndentPattern': '^\\s*(\\s*\\/[*].*[*]\\/\\s*)*[})]',
    },
    'onEnterRules': [
      {
        'beforeText': '^\\s*//\\s*\\S|\\s//\\s+\\S',
        'afterText': '^(?!\\s*$)',
        'action': {
          'indent': 'none',
          'appendText': '// ',
        },
      },
    ],
  },
  c: {
    'indentationRules': {
      'decreaseIndentPattern': {
        'pattern': '^\\s*[\\}\\]\\)].*$',
      },
      'increaseIndentPattern': {
        'pattern': '^.*(\\{[^}]*|\\([^)]*|\\[[^\\]]*)$',
      },
    },
    'onEnterRules': [
      {
        'previousLineText': '^\\s*(((else ?)?if|for|while)\\s*\\(.*\\)\\s*|else\\s*)$',
        'beforeText': '^\\s+([^{i\\s]|i(?!f\\b))',
        'action': {
          'indent': 'outdent',
        },
      },
      {
        'beforeText': '^\\s*//\\s*\\S|\\s//\\s+\\S',
        'afterText': '^(?!\\s*$)',
        'action': {
          'indent': 'none',
          'appendText': '// ',
        },
      },
    ],
  },
  cpp: {
    'indentationRules': {
      'decreaseIndentPattern': {
        'pattern': '^\\s*[\\}\\]\\)].*$',
      },
      'increaseIndentPattern': {
        'pattern': '^.*(\\{[^}]*|\\([^)]*|\\[[^\\]]*)$',
      },
    },
    'onEnterRules': [
      {
        'previousLineText': '^\\s*(((else ?)?if|for|while)\\s*\\(.*\\)\\s*|else\\s*)$',
        'beforeText': '^\\s+([^{i\\s]|i(?!f\\b))',
        'action': {
          'indent': 'outdent',
        },
      },
      {
        'beforeText': '^\\s*//\\s*\\S|\\s//\\s+\\S',
        'afterText': '^(?!\\s*$)',
        'action': {
          'indent': 'none',
          'appendText': '// ',
        },
      },
    ],
  },
  // Hand-authored: microsoft/vscode ships no indentationRules for C#. The
  // brace-and-paren shape follows the C++ rules, plus `case:`/`default:` so a
  // switch body indents, which is where the absence was most visible.
  csharp: {
    indentationRules: {
      increaseIndentPattern: "^.*\\{[^}\"']*$|^\\s*(case\\b.*|default):\\s*$|^.*\\([^)\"']*$",
      decreaseIndentPattern: '^\\s*(\\}|\\)|case\\b.*:|default:)',
    },
    onEnterRules: [
      {
        // `///` XML doc comments continue onto the next line.
        beforeText: '^\\s*///.*$',
        action: { indent: 'none', appendText: '/// ' },
      },
    ],
  },
}
