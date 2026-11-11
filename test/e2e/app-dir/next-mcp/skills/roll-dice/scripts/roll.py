import random, sys
print([random.randint(1, int(sys.argv[1])) for _ in range(int(sys.argv[2]))])
