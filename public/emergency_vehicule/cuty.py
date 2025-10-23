import json

# Load your JSON (replace this with the filename if reading from a file)
with open("trips_p.json", "r") as f:
    data = json.load(f)

# Loop through all trips and cut their paths
for trip in data.get("trips", []):
    path = trip.get("path", [])
    half = len(path) // 2
    trip["path"] = path[half:]  # Keep only the second half

# Optionally, save the modified data back to a file
with open("trips_half_removed.json", "w") as f:
    json.dump(data, f, indent=2)

print("✅ First half of each path removed and saved to 'trips_half_removed.json'")
