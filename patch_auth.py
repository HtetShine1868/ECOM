path = r'C:\Users\User\Downloads\ecommerce-frontend\src\context\AuthContext.tsx'

with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'payload.sub as string' in line and '// JWT' in line:
        lines[i] = '      name: (payload.name as string) || (payload.sub as string) || "",\n'
        print(f"Patched line {i+1}")
        break
else:
    print("Pattern not found!")
    for i, line in enumerate(lines):
        if 'payload' in line and 'name' in line:
            print(f"  {i+1}: {repr(line)}")

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Done.")
