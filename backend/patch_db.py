import json
import os
from pymongo import MongoClient

def patch():
    # Coba MongoDB dulu
    uri = "mongodb://127.0.0.1:27017"
    client = MongoClient(uri, serverSelectionTimeoutMS=2000)
    try:
        client.admin.command('ping')
        db = client["cryptovote"]
        col = db["elections"]
        election = col.find_one({"_id": "campus-2026"})
        if election:
            has_abstain = any(c.get("id") == "abstain" for c in election.get("candidates", []))
            if not has_abstain:
                election.setdefault("candidates", []).append({
                    "id": "abstain",
                    "name": "Kotak Kosong",
                    "party": "Abstain",
                    "color": "#9ca3af",
                    "platform": "Pemilih memilih untuk tidak memberikan suara kepada kandidat mana pun.",
                    "votes": 0
                })
                col.update_one({"_id": "campus-2026"}, {"$set": {"candidates": election["candidates"]}})
                print("Patched MongoDB!")
                return
    except Exception as e:
        print("Mongo err", e)
        pass

    # Coba local file
    data_file = ".data/election-state.json"
    if os.path.exists(data_file):
        with open(data_file, "r") as f:
            state = json.load(f)
        election = state.get("election", {})
        has_abstain = any(c.get("id") == "abstain" for c in election.get("candidates", []))
        if not has_abstain:
            election.setdefault("candidates", []).append({
                "id": "abstain",
                "name": "Kotak Kosong",
                "party": "Abstain",
                "color": "#9ca3af",
                "platform": "Pemilih memilih untuk tidak memberikan suara kepada kandidat mana pun.",
                "votes": 0
            })
            with open(data_file, "w") as f:
                json.dump(state, f, indent=2)
            print("Patched local JSON!")
            
patch()
