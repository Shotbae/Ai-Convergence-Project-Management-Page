"""Generate the pinned rule/Unicode data from the unmodified Python reference."""
import importlib.util
import json
from pathlib import Path
import re
import sys
import types
import unicodedata

if unicodedata.unidata_version != '15.0.0':
    raise RuntimeError('Use Python Unicode 15.0.0 to regenerate the pinned rule data.')

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / 'tests' / 'reference'
package = types.ModuleType('reference')
package.__path__ = [str(REFERENCE)]
sys.modules['reference'] = package
spec = importlib.util.spec_from_file_location('reference.local_rules', REFERENCE / 'local_rules.py')
rules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rules)
exceptions = sys.modules['reference.rule_exceptions']

def pattern(value):
    if value is None:
        return None
    source = re.sub(r'\\U([0-9a-fA-F]{8})', lambda m: r'\u{' + m[1] + '}', value.pattern)
    source = source.replace('(?i)', '').replace('(?P<term>', '(?<term>')
    return {'source': source, 'flags': 'i' if value.flags & re.I else ''}

def ranges(predicate):
    result = []
    start = None
    for cp in range(0x110001):
        yes = cp < 0x110000 and predicate(chr(cp))
        if yes and start is None:
            start = cp
        elif not yes and start is not None:
            result.append([start, cp - 1])
            start = None
    return result

data = {
    'version': rules.LOCAL_RULESET_VERSION,
    'unicodeVersion': unicodedata.unidata_version,
    'names': list(rules.PROHIBITED_DB.items()),
    'boundaries': sorted(rules._BOUNDARY_REQUIRED),
    'nameExceptions': {key: [pattern(p) for p in values] for key, values in rules._FALSE_POS_PATTERNS.items()},
    'nailLine': pattern(rules._NAIL_LINE_EXPRESSION),
    'moeExceptions': {key: [pattern(p) for p in values] for key, values in rules._MOE_TERM_EXCEPTIONS.items()},
    'moe': [{key: pattern(value) if key.endswith('pattern') else value for key, value in rule.items()}
            for rule in rules._MOE_SENSITIVE_RULES],
    'cjk': pattern(rules._CJK_FOREIGN_PATTERN),
    'foreignExceptions': sorted(exceptions.FOREIGN_TEXT_EXCEPTIONS),
    'allowed': sorted(exceptions.SYMBOL_ALLOWED),
    'review': sorted(exceptions.SYMBOL_REVIEW),
    'forbidden': sorted(exceptions.SYMBOL_FORBIDDEN),
    'spaces': ranges(str.isspace),
    'digits': ranges(str.isdigit),
    'symbols': ranges(lambda c: unicodedata.category(c)[0] in 'PS'),
    'hidden': ranges(rules._is_hidden_or_nonstandard_space),
    'hiddenLabels': {str(cp): rules._hidden_char_label(chr(cp)) for cp in range(0x110000)
                     if rules._is_hidden_or_nonstandard_space(chr(cp))},
}
encoded = json.dumps(data, ensure_ascii=True, separators=(',', ':'))
target = ROOT / 'aiconvpromanage.gs'
text = target.read_text(encoding='utf-8')
start = '// BEGIN GENERATED SETC RULE DATA'
end = '// END GENERATED SETC RULE DATA'
block = start + '\nvar SETC_RULE_DATA_ = ' + encoded + ';\n' + end
if start in text:
    text = text[:text.index(start)] + block + text[text.index(end) + len(end):]
else:
    text = text.rstrip() + '\n\n' + block + '\n'
target.write_text(text, encoding='utf-8', newline='\r\n')
print('Generated:', data['version'], 'Unicode', data['unicodeVersion'])
