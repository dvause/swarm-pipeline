import csv
import os
from collections import defaultdict

# Resolve input path relative to this script's location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT = os.path.join(SCRIPT_DIR, "..", "..", "input", "sample-players.csv")

def main():
    players = []
    with open(INPUT, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row["projected_points"] = float(row["projected_points"])
            players.append(row)

    by_position = defaultdict(list)
    for p in players:
        by_position[p["position"]].append(p)

    print("=== Fantasy Football Player Summary ===")
    print(f"Total players: {len(players)}\n")

    for pos in sorted(by_position):
        group = sorted(by_position[pos], key=lambda x: x["projected_points"], reverse=True)
        pts = [p["projected_points"] for p in group]
        avg = sum(pts) / len(pts)
        top = group[0]
        print(f"--- {pos} ({len(group)} players) ---")
        print(f"  Top:  {top['player']} ({top['team']}) — {top['projected_points']} pts")
        print(f"  Avg projected: {avg:.1f} pts")
        for p in group:
            print(f"    {p['player']:<25} {p['team']:<5} {p['projected_points']}")
        print()

    overall_top = max(players, key=lambda x: x["projected_points"])
    overall_avg = sum(p["projected_points"] for p in players) / len(players)
    print(f"Overall top scorer: {overall_top['player']} ({overall_top['projected_points']} pts)")
    print(f"Overall avg projected: {overall_avg:.1f} pts")

if __name__ == "__main__":
    main()
