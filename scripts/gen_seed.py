# Generates seed.js from the AppSheet Excel export.
import openpyxl, json, datetime, os

XLSX = r"C:\Users\ARUL\Downloads\Arul_TA_Bill_App (3).xlsx"
OUT  = r"F:\TA_DIARY\seed.js"

wb = openpyxl.load_workbook(XLSX, data_only=True)

def rows(name):
    ws = wb[name]
    data = list(ws.iter_rows(values_only=True))
    hdr = list(data[0])
    idx = {h: i for i, h in enumerate(hdr)}
    return data[1:], idx

def d2s(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    return "" if v is None else str(v)

def t2s(v):
    if isinstance(v, datetime.time):
        return v.strftime("%H:%M")
    if isinstance(v, datetime.datetime):
        return v.strftime("%H:%M")
    return "" if v is None else str(v)

def num(v):
    try: return float(v)
    except (TypeError, ValueError): return 0

def s(v):
    if v is None: return ""
    if isinstance(v, float) and v.is_integer(): return str(int(v))
    return str(v).strip()

# ---- Profiles ----
prof_rows, pi = rows("Profile")
profiles = []
for r in prof_rows:
    email = s(r[pi["UserEmail"]])
    if not email: continue
    profiles.append({
        "email": email,
        "name": s(r[pi["Name"]]),
        "desg": s(r[pi["Designation"]]),
        "basic": s(r[pi["Basic"]]),
        "parent": s(r[pi["Parent_Office"]]),
        "pincode": s(r[pi["Pincode"]]),
        "daily": num(r[pi["Daily_TA_Fare"]]),
        "mileage": num(r[pi["Millage_Fare_Per_KM"]]),
        "maxBike": num(r[pi["Maximum_Bike_Distance"]]),
        "submitTo": s(r[pi["Diary_Submiited_to"]]),
        "every": s(r[pi["Diary_Submitted_Every"]]) or "Fortnight",
    })

# ---- Main entries ----
main_rows, mi = rows("Main")
entries = []
for r in main_rows:
    email = s(r[mi["Useremail"]])
    if not email: continue
    fd = d2s(r[mi["From_Date"]])
    if not fd: continue
    entries.append({
        "id": s(r[mi["ID1"]]) or (email[:4] + fd + str(len(entries))),
        "email": email,
        "today": s(r[mi["Today_Work"]]) or "Parent_Office",
        "officeFrom": s(r[mi["Office_From"]]),
        "officeTo": s(r[mi["Office_To"]]),
        "fromDate": fd,
        "fromTime": t2s(r[mi["From_Time"]]),
        "toDate": d2s(r[mi["To_Date"]]) or fd,
        "toTime": t2s(r[mi["To_Time"]]),
        "mode": s(r[mi["Mode"]]),
        "distance": num(r[mi["Distance"]]),
        "fare": num(r[mi["Fare"]]),
        "days": num(r[mi["Days"]]),
        "purpose": s(r[mi["Purpose_of_Visit"]]) or s(r[mi["Diary_Short_Text"]]),
        "diaryDetail": s(r[mi["Purpose_of_Visit"]]),
        "diaryShort": s(r[mi["Diary_Short_Text"]]),
        "taShort": s(r[mi["TA_Bill_Format"]]),
        "completed": s(r[mi["Trip_Completed"]]) or "Yes",
        "trip": int(num(r[mi["Trip_Number"]])) or 0,
    })

# ---- Visit reports ----
HWCOLS = ["Genset","UPS","System","Router_Switch","Laser_Printer","Dot_Matrix_Printer","Passbook_Printer","Inkjet_Adhar_Printer"]
SWCOLS = ["APT module","Finacle","Adhar","NSP1","NSP2","Adhar Software","EKYC Kit"]
vis_rows, vi = rows("Visit_Report")
visits = []
for r in vis_rows:
    email = s(r[vi["Useremail"]])
    office = s(r[vi["Office_Name_Visited"]])
    if not email or not office: continue
    visits.append({
        "id": s(r[vi["ID"]]) or (email[:4] + str(len(visits))),
        "email": email,
        "date": d2s(r[vi["Date"]]),
        "office": office,
        "pincode": s(r[vi["Office_Visited_Pincode"]]),
        "ref": "",
        "hw": [s(r[vi[c]]) for c in HWCOLS],
        "sw": [s(r[vi[c]]) for c in SWCOLS],
        "aptDtr": s(r[vi["Balance in APT and DTR"]]),
        "boBal": s(r[vi["BO Balance in DTR with Manual Daily Account"]]),
        "disc": s(r[vi["Any Other Discrepancies"]]),
        "purpose": s(r[vi["Reason"]]),
        "result": s(r[vi["Result"]]),
    })

# ---- Office -> pincode (APT office details) ----
office_pins = {}
apt_rows, ai = rows("APT_Office_Details")
for r in apt_rows:
    nm = s(r[ai["office_name"]]).strip()
    pin = s(r[ai["pincode"]]).strip()
    if nm and pin and nm.lower() not in office_pins:
        office_pins[nm.lower()] = pin
# also learn pincodes from visit reports
for v in visits:
    if v["office"] and v["pincode"]:
        office_pins.setdefault(v["office"].strip().lower(), v["pincode"])

# ---- route (from||to) -> {distance, fare} from the Office lookup sheet ----
routes = {}
off_rows, oi = rows("Office")
for r in off_rows:
    fr = s(r[oi["Office_From"]]).strip().lower()
    to = s(r[oi["Office_To"]]).strip().lower()
    if not fr or not to: continue
    d = num(r[oi["Distance"]]); f = num(r[oi["Fare"]])
    routes[fr + "||" + to] = {"d": d, "f": f}
# also learn routes from Main entries (any user)
for e in entries:
    if e["today"] == "Outside" and e["officeFrom"] and e["officeTo"]:
        k = e["officeFrom"].strip().lower() + "||" + e["officeTo"].strip().lower()
        routes.setdefault(k, {"d": e["distance"], "f": e["fare"]})

seed = {"profiles": profiles, "entries": entries, "visits": visits,
        "officePins": office_pins, "routes": routes,
        "active": "arulece05@gmail.com"}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write("window.TA_SEED = ")
    json.dump(seed, f, ensure_ascii=False, indent=1)
    f.write(";\n")

print(f"profiles={len(profiles)} entries={len(entries)} visits={len(visits)}")
print("wrote", OUT)
