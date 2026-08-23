# Generates supabase/seed.sql (INSERT statements) from seed.js.
import json, os

SEED = r"F:\TA_DIARY\seed.js"
OUT  = r"F:\TA_DIARY\supabase\seed.sql"
ADMIN = "arulece05@gmail.com"

raw = open(SEED, encoding="utf-8").read()
d = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])

def q(v):   # required text
    return "'" + str("" if v is None else v).replace("'", "''") + "'"
def qt(v):  # text or NULL if empty
    if v is None or str(v) == "": return "NULL"
    return "'" + str(v).replace("'", "''") + "'"
def num(v):
    try:
        if v is None or v == "": return "0"
        return repr(float(v))
    except (TypeError, ValueError):
        return "0"
def dt(v):  # date/time literal or NULL
    if not v: return "NULL"
    return "'" + str(v) + "'"
def jb(v):  # jsonb literal
    return "'" + json.dumps(v or [], ensure_ascii=False).replace("'", "''") + "'::jsonb"

L = ["-- TA Diary seed data (generated from seed.js). Run AFTER schema.sql.",
     "begin;", ""]

L.append("-- profiles (" + str(len(d["profiles"])) + ")")
for p in d["profiles"]:
    L.append("insert into profiles(email,name,designation,basic,parent_office,pincode,daily_ta_fare,mileage_fare,max_bike,submit_to,submit_every,is_admin) values ("
        + ",".join([q(p["email"]), qt(p.get("name")), qt(p.get("desg")), qt(p.get("basic")),
                    qt(p.get("parent")), qt(p.get("pincode")), num(p.get("daily")), num(p.get("mileage")),
                    num(p.get("maxBike")), qt(p.get("submitTo")), qt(p.get("every") or "Fortnight"),
                    "true" if p["email"] == ADMIN else "false"])
        + ") on conflict (email) do nothing;")

L.append("")
L.append("-- entries (" + str(len(d["entries"])) + ")")
for e in d["entries"]:
    L.append("insert into entries(id,email,today,leave_type,office_from,office_to,from_date,from_time,to_date,to_time,mode,distance,fare,days,trip,completed,diary_detail,diary_short,ta_short,purpose) values ("
        + ",".join([q(e["id"]), q(e["email"]), qt(e.get("today")), qt(e.get("leaveType")),
                    qt(e.get("officeFrom")), qt(e.get("officeTo")), dt(e.get("fromDate")), dt(e.get("fromTime")),
                    dt(e.get("toDate")), dt(e.get("toTime")), qt(e.get("mode")), num(e.get("distance")),
                    num(e.get("fare")), num(e.get("days")), str(int(float(e.get("trip") or 0))),
                    qt(e.get("completed")), qt(e.get("diaryDetail")), qt(e.get("diaryShort")),
                    qt(e.get("taShort")), qt(e.get("purpose"))])
        + ") on conflict (id) do nothing;")

L.append("")
L.append("-- visits (" + str(len(d["visits"])) + ")")
for v in d["visits"]:
    L.append("insert into visits(id,email,date,office,pincode,ref,hw,sw,apt_dtr,bo_bal,disc,purpose,result) values ("
        + ",".join([q(v["id"]), q(v["email"]), dt(v.get("date")), qt(v.get("office")), qt(v.get("pincode")),
                    qt(v.get("ref")), jb(v.get("hw")), jb(v.get("sw")), qt(v.get("aptDtr")), qt(v.get("boBal")),
                    qt(v.get("disc")), qt(v.get("purpose")), qt(v.get("result"))])
        + ") on conflict (id) do nothing;")

op = d.get("officePins", {})
L.append("")
L.append("-- offices (" + str(len(op)) + ")")
for name, pin in op.items():
    L.append("insert into offices(name,pincode) values (" + q(name) + "," + qt(pin) + ") on conflict (name) do nothing;")

rt = d.get("routes", {})
L.append("")
L.append("-- routes (" + str(len(rt)) + ")")
for k, val in rt.items():
    fr, _, to = k.partition("||")
    L.append("insert into routes(office_from,office_to,distance,fare) values ("
        + ",".join([q(fr), q(to), num(val.get("d")), num(val.get("f"))])
        + ") on conflict (office_from,office_to) do nothing;")

L += ["", "commit;", ""]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w", encoding="utf-8").write("\n".join(L))
print(f"wrote {OUT}: profiles={len(d['profiles'])} entries={len(d['entries'])} visits={len(d['visits'])} offices={len(op)} routes={len(rt)}")
