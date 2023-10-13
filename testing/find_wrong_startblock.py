import sys

def find_block_number(filename):
    with open(filename, 'r') as file:
        lines = file.readlines()

    flag = False
    start_block = None
    start_line = None
    for i, line in enumerate(lines):
        if 'The current round has ended' in line:
            flag = True
            start_line = i
        elif flag:
            if 'Start Block for round' in line:
                start_block = line.split(' ')[-1].strip()
            elif 'Current Producer:' in line:
                producer = line.split(':')[-1].strip()
                if producer != 'guild.nefty':
                    print(start_block)
                    break
            if i - start_line > 25:
                flag = False

# Usage
if len(sys.argv) > 1:
    find_block_number(sys.argv[1])
else:
    print("Please provide a filename.")