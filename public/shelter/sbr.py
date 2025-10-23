import json
import random

# Load your GeoJSON file
with open("CA-CH_combined_lonlat.geojson", "r", encoding="utf-8") as f:
    data = json.load(f)

for feature in data["features"]:
    props = feature["properties"]

    # Generate a random fill level between 0.1 and 0.9
    fill_level = round(random.uniform(0.1, 0.9), 2)
    props["fill_level"] = fill_level

    # Get numeric capacity (default 0 if missing or invalid)
    capacity_str = props.get("Capacité") or props.get("Capacit�_1")
    try:
        capacity = int(capacity_str)
    except (TypeError, ValueError):
        capacity = 0

    # Compute remaining spots based on fill level
    remaining_spot = int(capacity * (1 - fill_level)) if capacity else None
    props["remaining_spot"] = remaining_spot

# Save the updated GeoJSON
with open("CA-CH_combined_lonlat_with_fill.geojson", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("✅ Added 'fill_level' and 'remaining_spot' to all features.")
