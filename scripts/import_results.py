#!/usr/bin/env python3
"""Import additional en/zh evaluation runs: python3 scripts/import_results.py RESULTS_DIR.

Uses the benchmark's frozen WER thresholds. Missing WER passes, as in the
original evaluator; heatmap scores are unpenalized final-score means.
No audio paths are imported because evaluation runs do not contain audio.
"""
import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Any, Set

ROOT = Path(__file__).resolve().parents[1]
MODELS = {
    'qwen_audio_tts_flash_text': 'Qwen-Audio-TTS-Flash',
    'qwen_audio_tts_plus_text': 'Qwen-Audio-TTS-Plus',
    'fireredtts3': 'FireRedTTS3',
    'ming_3_0_tts_tiny': 'Ming-3.0-TTS-Tiny',
}
TIMBRE_ATTRS = {'age', 'gender', 'pitch', 'texture'}
STYLE_ATTRS = {'speed', 'volume', 'emotion', 'accent', 'personality', 'tone'}
BUCKETS = ['overall', 'timbre', 'style', 'easy_tag', 'easy_direct', 'easy_simple_comp',
           'hard_multi_comp', 'hard_dynamic', 'hard_layered', 'hard_conflict',
           'persona_scenario', 'persona_character', 'special_disfluency',
           'special_dysphonia', 'special_implicit', 'special_explicit']


def has_any_attr(values, attrs):
    return isinstance(values, dict) and bool(values.keys() & attrs)

def bucket_keys_for_item(taxonomy_node: str, target_values: Any) -> Set[str]:
    keys: Set[str] = {"overall"}

    if has_any_attr(target_values, TIMBRE_ATTRS):
        keys.add("timbre")
    if has_any_attr(target_values, STYLE_ATTRS):
        keys.add("style")

    node = str(taxonomy_node or "")
    if node.startswith("easy/"):
        if "/tag/" in node:
            keys.add("easy_tag")
        elif "/direct/" in node:
            keys.add("easy_direct")
        elif node.startswith("easy/composite/simple_comp/static"):
            keys.add("easy_simple_comp")

    if node.startswith("hard/composite/complex_comp/static"):
        keys.add("hard_multi_comp")
    elif node.startswith("hard/composite/complex_comp/dynamic"):
        keys.add("hard_dynamic")
    elif node.startswith("hard/composite/complex_comp/layered"):
        keys.add("hard_layered")
    elif node.startswith("hard/composite/complex_comp/conflict"):
        keys.add("hard_conflict")

    if node.startswith("hard/composite/persona/scenario"):
        keys.add("persona_scenario")
    elif node.startswith("hard/composite/persona/"):
        keys.add("persona_character")

    if node.startswith("special/extra_vocal/abnormal/disfluency"):
        keys.add("special_disfluency")
    elif node.startswith("special/extra_vocal/abnormal/dysphonia"):
        keys.add("special_dysphonia")
    elif node.startswith("special/extra_vocal/implicit_nv"):
        keys.add("special_implicit")
    elif node.startswith("special/extra_vocal/explicit_nv"):
        keys.add("special_explicit")

    return keys

def cell(items, threshold):
    if not items:
        return '<td>—</td>'
    raw_if = mean(x[0] for x in items)
    raw_total = mean(x[1] for x in items)
    passed = mean(w is None or w <= threshold for _, _, w in items)
    wers = [w for _, _, w in items if w is not None]
    wer = f'{mean(wers):.1%}' if wers else 'N/A'
    if not wers and any(x[2] is None for x in items):
        pass_text = 'N/A'
    else:
        pass_text = f'{passed:.1%}'
    return (f'<td><div class="score-main">{raw_if * passed:.2f} / {raw_total * passed:.2f}</div>'
            f'<div class="score-sub">raw {raw_if:.2f} / {raw_total:.2f}<br>'
            f'WER {wer} | Pass {pass_text}</div></td>')



def sort_leaderboards(html):
    """Rank all models by penalized Overall instruction-following score."""
    def sort_table(match):
        body = match[2]
        row_pattern = r'<tr class="model-row">.*?</tr>'
        rows = re.findall(row_pattern, body, flags=re.S)
        rows.sort(key=lambda row: float(re.search(
            r'class="score-main">([0-9.]+)', row)[1]), reverse=True)
        ordered = iter(rows)
        body = re.sub(row_pattern, lambda _: next(ordered), body, flags=re.S)
        return match[1] + body + match[3]
    return re.sub(r'(<table\b[^>]*id="table-[^"]+".*?<tbody>)(.*?)(</tbody>)',
                  sort_table, html, flags=re.S)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('results_dir', type=Path)
    parser.add_argument('--qwen-flash-zh-wer', type=Path)
    parser.add_argument('--qwen-plus-zh-wer', type=Path)
    parser.add_argument('--run-override', type=Path, action='append', default=[],
                        help='Use a replacement run directory (repeatable; keep its original name).')
    args = parser.parse_args()
    run_overrides = {p.name: p for p in args.run_override}
    overrides = {
        'qwen_audio_tts_flash_text': args.qwen_flash_zh_wer,
        'qwen_audio_tts_plus_text': args.qwen_plus_zh_wer,
    }
    html = (ROOT / 'index.html').read_text()
    for lang, threshold in [('en', .0225), ('zh', .0150)]:
        path = ROOT / f'assets/demos/inst_follow/metadatas/detailed_leaderboard_{lang}.json'
        detailed = json.loads(path.read_text())
        for model, name in MODELS.items():
            run_name = f'{model}_full_outputs_{lang}'
            run = run_overrides.get(run_name, args.results_dir / run_name)
            wers = {}
            wer_path = (overrides.get(model) if lang == 'zh' else None) or run / 'wer.out'
            if model in overrides and not wer_path.exists():
                raise FileNotFoundError(f'Qwen WER required: {wer_path}')
            with (wer_path.open() if wer_path.exists() else open('/dev/null')) as file:
                for row in csv.reader(file, delimiter='\t'):
                    if len(row) >= 2 and Path(row[0]).suffix in {'.wav', '.mp3'}:
                        wers[Path(row[0]).stem] = float(row[1])
            buckets, nodes = defaultdict(list), defaultdict(list)
            seen = set()
            for file in sorted(run.glob('*.jsonl')):
                for line in file.read_text().splitlines():
                    item = json.loads(line)
                    ev = item.get('lalm_eval') or {}
                    if ev.get('instruction_following_level') is None or ev.get('final_score') is None:
                        continue  # Match the benchmark: exclude records without valid scores.
                    if item['plan_id'] in seen:
                        raise ValueError(f'Duplicate plan: {item["plan_id"]}')
                    seen.add(item['plan_id'])
                    node = item['taxonomy_node']
                    value = (ev['instruction_following_level'], ev['final_score'], wers.get(Path(item['wav_path']).stem))
                    for key in bucket_keys_for_item(node, item.get('target_values', {})):
                        buckets[key].append(value)
                    parts = node.split('/')
                    for i in range(1, len(parts) + 1):
                        nodes['/'.join(parts[:i])].append(value[1])
            for node, scores in nodes.items():
                detailed.setdefault(node, {})[model] = round(mean(scores), 2)
            row = ('<tr class="model-row">\n<td class="sticky-col font-weight-bold">' + name + '</td>\n'
                   + '\n'.join(cell(buckets[key], threshold) for key in BUCKETS) + '\n</tr>')
            pattern = rf'(<table\b[^>]*id="table-{lang}".*?<tbody>)(.*?)(</tbody>)'
            def update(match):
                body = re.sub(r'<tr class="model-row">\s*<td[^>]*>' + re.escape(name) + r'</td>.*?</tr>', '', match[2], flags=re.S)
                return match[1] + body + row + '\n' + match[3]
            html, count = re.subn(pattern, update, html, flags=re.S)
            assert count == 1
            matched = sum(w is not None for _, _, w in buckets['overall'])
            print(f'{name} {lang}: {len(seen)} evaluations, {len(wers)} WER records, {matched} matched')
        path.write_text(json.dumps(detailed, ensure_ascii=False, indent=2) + '\n')
    (ROOT / 'index.html').write_text(sort_leaderboards(html))


if __name__ == '__main__':
    main()
