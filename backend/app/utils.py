import random
CORPUS = """
quick brown fox jumps over the lazy dog typing racer speed accuracy python websockets
matrix vector cache index query socket protocol router switch cloud latency throughput
optimize practice coding interview docker kubernetes microservice postgres sqlite redis queue
""".split()

def generate_words(n=180):
    return " ".join(random.choice(CORPUS) for _ in range(n))
