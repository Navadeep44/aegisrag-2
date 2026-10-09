import json

with open('test_results_detailed.json', encoding='utf-8') as f:
    data = json.load(f)

for item in data[:14]:
    print("\n" + "="*55)
    print(f"=== TEST {item['test_num']} ===")
    print(f"Question: {item['question']}")
    print(f"Status: {item.get('status')}")
    print(f"Answer:\n{item.get('answer')}")
    cits = [(c.get('page'), c.get('location'), c.get('section_heading')) for c in item.get('citations', [])]
    print(f"Citations ({len(cits)}): {cits}")
