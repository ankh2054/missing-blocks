import json

#INSERT INTO missingwax.emptyblocks (producer_id, block_number, date, empty_block)
#VALUES

with open('test.txt') as f:
    data = json.load(f)

for item in data['data']:
    owner_name = item['owner_name']
    block_number = item['block_number']
    date = item['date']
    empty_block = item['empty_block']

    print(f"((SELECT id FROM missingwax.producer WHERE owner_name = '{owner_name}'), {block_number}, '{date}', {empty_block}),")