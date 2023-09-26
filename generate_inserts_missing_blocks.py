import json

with open('test.txt') as f:
    data = json.load(f)

for item in data['data']:
    owner_name = item['owner_name']
    block_number = item['block_number']
    date = item['date']
    round_missed = item['round_missed']
    blocks_missed = item['blocks_missed']
    missed_block_count = item['missed_block_count']

    print(f"((SELECT id FROM missingwax.producer WHERE owner_name = '{owner_name}'), {block_number}, '{date}', {round_missed}, {blocks_missed}, {missed_block_count}),")