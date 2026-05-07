/**
 * Database seed — Melbourne workers + May 2026 jobs.
 * Workers have multiple jobs per day; scheduled times account for
 * real driving time between consecutive jobs via Google Maps.
 * First job of each day has no travel offset (worker comes from home).
 *
 * Run:  tsx --env-file=.env ./src/seed.ts
 */

import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { workersTable, jobsTable, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool);
const API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";

// ── Google Maps travel time ───────────────────────────────────────────────────

const travelCache = new Map<string, number>();

async function travelMins(from: string, to: string): Promise<number> {
  const key = `${from}|||${to}`;
  if (travelCache.has(key)) return travelCache.get(key)!;

  try {
    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${encodeURIComponent(from)}` +
      `&destinations=${encodeURIComponent(to)}` +
      `&mode=driving&avoid=tolls&region=au&key=${API_KEY}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const d = await r.json() as any;
    const mins =
      d.status === "OK" && d.rows?.[0]?.elements?.[0]?.status === "OK"
        ? Math.ceil(d.rows[0].elements[0].duration.value / 60)
        : 20; // fallback
    travelCache.set(key, mins);
    console.log(`   🗺  ${from.split(",")[0]} → ${to.split(",")[0]}: ${mins} min`);
    return mins;
  } catch {
    travelCache.set(key, 20);
    return 20;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** ISO timestamp in Melbourne AEST (UTC+10) */
function mel(dateStr: string, hour: number, minute = 0) {
  const h = String(hour).padStart(2, "0");
  const m = String(minute).padStart(2, "0");
  return `${dateStr}T${h}:${m}:00+10:00`;
}

function addMins(iso: string, mins: number) {
  return new Date(new Date(iso).getTime() + mins * 60_000).toISOString();
}

function addHrs(iso: string, hrs: number) {
  return new Date(new Date(iso).getTime() + hrs * 3_600_000).toISOString();
}

function mkAttendance(workerId: number, startIso: string, durationHrs: number, suburb: string) {
  const enRoute  = addMins(startIso, -20);
  const complete = addHrs(startIso, durationHrs);
  return JSON.stringify([
    { workerId, action: "clock_in",  ts: enRoute,           suburb },
    { workerId, action: "en_route",  ts: enRoute,           suburb },
    { workerId, action: "on_site",   ts: new Date(startIso).toISOString(), suburb },
    { workerId, action: "complete",  ts: complete,          suburb },
  ]);
}

function mkPartialAttendance(workerId: number, startIso: string, suburb: string) {
  return JSON.stringify([
    { workerId, action: "clock_in", ts: addMins(startIso, -20), suburb },
    { workerId, action: "en_route", ts: addMins(startIso, -20), suburb },
    { workerId, action: "on_site",  ts: new Date(startIso).toISOString(), suburb },
  ]);
}

function suburb(addr: string) {
  // "123 Smith St, Fitzroy VIC 3065" → "Fitzroy VIC 3065"
  const parts = addr.split(",");
  return (parts.slice(1).join(",")).trim();
}

// ── Worker definitions ────────────────────────────────────────────────────────

const WORKERS = [
  { name: "James Kowalski",  tradeType: "Electrician",    phone: "0412345678", email: "james.kowalski@email.com",  isAvailable: true, hourlyRate: 75,  skillsJson: JSON.stringify(["White Card","EWP Licence","HV Licence"]) },
  { name: "Sarah Nguyen",    tradeType: "Plumber",         phone: "0423456789", email: "sarah.nguyen@email.com",    isAvailable: true, hourlyRate: 80,  skillsJson: JSON.stringify(["White Card","Gasfitting","Drainage"]) },
  { name: "Michael Chen",    tradeType: "Carpenter",       phone: "0434567890", email: "michael.chen@email.com",    isAvailable: true, hourlyRate: 70,  skillsJson: JSON.stringify(["White Card","Cabinet Making","Formwork"]) },
  { name: "Emma Thompson",   tradeType: "Painter",         phone: "0445678901", email: "emma.thompson@email.com",   isAvailable: true, hourlyRate: 65,  skillsJson: JSON.stringify(["White Card","Lead Paint Removal"]) },
  { name: "Daniel Murphy",   tradeType: "HVAC",            phone: "0456789012", email: "daniel.murphy@email.com",   isAvailable: true, hourlyRate: 85,  skillsJson: JSON.stringify(["White Card","ARCtick","Refrigerant Handling"]) },
  { name: "Olivia Brown",    tradeType: "General Builder", phone: "0467890123", email: "olivia.brown@email.com",    isAvailable: true, hourlyRate: 72,  skillsJson: JSON.stringify(["White Card","Construction Induction","Scaffolding"]) },
  { name: "Ryan Patel",      tradeType: "Roofer",          phone: "0478901234", email: "ryan.patel@email.com",      isAvailable: true, hourlyRate: 78,  skillsJson: JSON.stringify(["White Card","Height Safety","Asbestos Awareness"]) },
  { name: "Jessica Williams",tradeType: "Landscaper",      phone: "0489012345", email: "jessica.williams@email.com",isAvailable: true, hourlyRate: 60,  skillsJson: JSON.stringify(["White Card","ChemCert","Bobcat Licence"]) },
];
// Indices: james=0, sarah=1, michael=2, emma=3, daniel=4, olivia=5, ryan=6, jessica=7

// ── Schedule ──────────────────────────────────────────────────────────────────
// Each entry is one worker's day: first job starts at startHour (AEST).
// Subsequent jobs start after previous job + Google Maps travel time.
// status applies to all jobs in the day.

type J = {
  title: string; clientName: string; clientPhone: string;
  addr: string; hrs: number; price: number; vc: 1|2|3;
  notes?: string; numTradies?: number;
};
type Day = { w: number; date: string; startHour: number; status: string; jobs: J[] };

const SCHEDULE: Day[] = [

  // ════════════════════════════════════════════════════════════════════════════
  // JAMES KOWALSKI — Electrician
  // ════════════════════════════════════════════════════════════════════════════
  { w:0, date:"2026-05-04", startHour:8, status:"completed", jobs:[
    { title:"Power point additions", clientName:"Marcus Webb", clientPhone:"0490001702", addr:"123 Smith St, Fitzroy VIC 3065", hrs:2.5, price:680, vc:1 },
    { title:"Switchboard safety audit", clientName:"Diana Lowe", clientPhone:"0490001702", addr:"18 Johnston St, Collingwood VIC 3066", hrs:2, price:520, vc:2 },
  ]},
  { w:0, date:"2026-05-06", startHour:8, status:"completed", jobs:[
    { title:"Outdoor lighting install", clientName:"Chris Doyle", clientPhone:"0490001702", addr:"55 Toorak Rd, South Yarra VIC 3141", hrs:3.5, price:1650, vc:2 },
    { title:"Safety switch replacement", clientName:"Rebecca Yates", clientPhone:"0490001702", addr:"78 Glenferrie Rd, Malvern VIC 3144", hrs:2, price:480, vc:1 },
  ]},
  { w:0, date:"2026-05-08", startHour:8, status:"completed", jobs:[
    { title:"Kitchen circuit upgrade", clientName:"Brent Sutton", clientPhone:"0490001702", addr:"32 Lygon St, Carlton VIC 3053", hrs:4, price:1920, vc:3 },
    { title:"Fault finding & repair", clientName:"Nadia Frost", clientPhone:"0490001702", addr:"45 Church St, Richmond VIC 3121", hrs:2, price:560, vc:2 },
  ]},
  { w:0, date:"2026-05-12", startHour:8, status:"completed", jobs:[
    { title:"LED downlight installation", clientName:"Felix Harper", clientPhone:"0490001702", addr:"100 High St, Northcote VIC 3070", hrs:3, price:840, vc:1 },
    { title:"Carport power supply", clientName:"Zara Mills", clientPhone:"0490001702", addr:"89 Sydney Rd, Brunswick VIC 3056", hrs:2.5, price:750, vc:2 },
  ]},
  { w:0, date:"2026-05-14", startHour:7, status:"completed", jobs:[
    { title:"Full house rewire — stage 1", clientName:"Graham Reeves", clientPhone:"0490001702", addr:"12 Auburn Rd, Hawthorn VIC 3122", hrs:5, price:3200, vc:3 },
    { title:"Security lighting — rear yard", clientName:"Lena Chambers", clientPhone:"0490001702", addr:"8 High St, Kew VIC 3101", hrs:2.5, price:890, vc:2 },
  ]},
  { w:0, date:"2026-05-19", startHour:8, status:"confirmed", jobs:[
    { title:"Switchboard upgrade — 3-phase", clientName:"Derek Lawson", clientPhone:"0490001702", addr:"34 Buckley St, Essendon VIC 3040", hrs:5, price:2900, vc:3 },
    { title:"Smoke alarm compliance", clientName:"Heidi Cross", clientPhone:"0490001702", addr:"56 Ferguson St, Williamstown VIC 3016", hrs:1.5, price:380, vc:1 },
  ]},
  { w:0, date:"2026-05-21", startHour:8, status:"confirmed", jobs:[
    { title:"Office electrical fitout", clientName:"BluePeak Consulting", clientPhone:"0490001702", addr:"500 Bourke St, Melbourne VIC 3000", hrs:5, price:4200, vc:3 },
    { title:"Emergency exit lighting", clientName:"Docklands Gym", clientPhone:"0490001702", addr:"43 Waterfront Way, Docklands VIC 3008", hrs:2.5, price:960, vc:2 },
  ]},
  { w:0, date:"2026-05-26", startHour:8, status:"pending", jobs:[
    { title:"Bathroom exhaust fan install", clientName:"Petra Voss", clientPhone:"0490001702", addr:"78 Acland St, St Kilda VIC 3182", hrs:2, price:420, vc:1 },
    { title:"Hot water timer & circuit", clientName:"Yusuf Karim", clientPhone:"0490001702", addr:"201 Chapel St, Prahran VIC 3181", hrs:2.5, price:680, vc:2 },
  ]},
  { w:0, date:"2026-05-28", startHour:8, status:"pending", jobs:[
    { title:"Rewire rear cottage", clientName:"Fiona Hartley", clientPhone:"0490001702", addr:"38 Were St, Brighton VIC 3186", hrs:4.5, price:2600, vc:3 },
    { title:"Garden lighting circuit", clientName:"Claude Bernard", clientPhone:"0490001702", addr:"25 Orrong Rd, Caulfield VIC 3162", hrs:2, price:580, vc:1 },
  ]},

  // ════════════════════════════════════════════════════════════════════════════
  // SARAH NGUYEN — Plumber
  // ════════════════════════════════════════════════════════════════════════════
  { w:1, date:"2026-05-05", startHour:8, status:"completed", jobs:[
    { title:"Leaking tap & valve replacement", clientName:"Simone Archer", clientPhone:"0490001702", addr:"180 Bridge Rd, Richmond VIC 3121", hrs:2, price:480, vc:1 },
    { title:"Drain unblocking", clientName:"Boris Holt", clientPhone:"0490001702", addr:"22 Victoria St, Abbotsford VIC 3067", hrs:1.5, price:320, vc:1 },
  ]},
  { w:1, date:"2026-05-07", startHour:8, status:"completed", jobs:[
    { title:"Bathroom tap set replacement", clientName:"Ingrid Moller", clientPhone:"0490001702", addr:"201 Chapel St, Prahran VIC 3181", hrs:2.5, price:650, vc:2 },
    { title:"Toilet suite install", clientName:"Wayne Briggs", clientPhone:"0490001702", addr:"78 Acland St, St Kilda VIC 3182", hrs:2, price:520, vc:1 },
  ]},
  { w:1, date:"2026-05-09", startHour:8, status:"completed", jobs:[
    { title:"Hot water system service", clientName:"Tamara Nguyen", clientPhone:"0490001702", addr:"32 Lygon St, Carlton VIC 3053", hrs:2, price:580, vc:2 },
    { title:"Laundry connection — new build", clientName:"Uni of Melbourne", clientPhone:"0490001702", addr:"Grattan St, Parkville VIC 3052", hrs:2.5, price:780, vc:2 },
  ]},
  { w:1, date:"2026-05-13", startHour:8, status:"completed", jobs:[
    { title:"Full bathroom rough-in", clientName:"Gary Newton", clientPhone:"0490001702", addr:"12 Auburn Rd, Hawthorn VIC 3122", hrs:5, price:2200, vc:3 },
    { title:"Outside tap installation", clientName:"Vera Coleman", clientPhone:"0490001702", addr:"67 Burke Rd, Camberwell VIC 3124", hrs:1.5, price:280, vc:1 },
  ]},
  { w:1, date:"2026-05-15", startHour:8, status:"completed", jobs:[
    { title:"Drain camera inspection", clientName:"Pete Hoffman", clientPhone:"0490001702", addr:"100 High St, Northcote VIC 3070", hrs:2, price:450, vc:2 },
    { title:"Water pressure regulator", clientName:"Xian Wong", clientPhone:"0490001702", addr:"45 St Georges Rd, Thornbury VIC 3071", hrs:1.5, price:380, vc:1 },
  ]},
  { w:1, date:"2026-05-19", startHour:8, status:"confirmed", jobs:[
    { title:"Kitchen renovation plumbing", clientName:"Aaron Finley", clientPhone:"0490001702", addr:"55 Toorak Rd, South Yarra VIC 3141", hrs:5, price:2800, vc:3 },
    { title:"Garden tap + irrigation main", clientName:"Damien Ashford", clientPhone:"0490001702", addr:"3 Albany Rd, Toorak VIC 3142", hrs:2, price:620, vc:2 },
  ]},
  { w:1, date:"2026-05-21", startHour:8, status:"confirmed", jobs:[
    { title:"HWS replacement — gas", clientName:"Natalie Cross", clientPhone:"0490001702", addr:"89 Sydney Rd, Brunswick VIC 3056", hrs:3, price:1450, vc:2 },
    { title:"Backflow preventer install", clientName:"Allan Park", clientPhone:"0490001702", addr:"Main St, Coburg VIC 3058", hrs:2, price:580, vc:2 },
  ]},
  { w:1, date:"2026-05-27", startHour:8, status:"pending", jobs:[
    { title:"Commercial kitchen plumbing", clientName:"Urban Goods Co.", clientPhone:"0490001702", addr:"12 Hopkins St, Footscray VIC 3011", hrs:5, price:3200, vc:3 },
    { title:"Outdoor shower connection", clientName:"Nina Walsh", clientPhone:"0490001702", addr:"56 Ferguson St, Williamstown VIC 3016", hrs:2, price:480, vc:1 },
  ]},
  { w:1, date:"2026-05-29", startHour:9, status:"pending", jobs:[
    { title:"Pipe relining — blocked main", clientName:"Phillip Tan", clientPhone:"0490001702", addr:"23 Buckley St, Moonee Ponds VIC 3039", hrs:3.5, price:2100, vc:2 },
    { title:"Laundry trough replacement", clientName:"Carol Dempsey", clientPhone:"0490001702", addr:"77 Racecourse Rd, Flemington VIC 3031", hrs:2, price:520, vc:1 },
  ]},
  // Emergency Code 9
  { w:1, date:"2026-05-31", startHour:7, status:"pending", jobs:[
    { title:"CODE 9 — Main water main burst", clientName:"Millhouse Apartments", clientPhone:"0490001702", addr:"1 St Georges Rd, Toorak VIC 3142", hrs:4, price:3800, vc:3, notes:"Burst cold main flooding basement. Immediate response." },
  ]},

  // ════════════════════════════════════════════════════════════════════════════
  // MICHAEL CHEN — Carpenter
  // ════════════════════════════════════════════════════════════════════════════
  { w:2, date:"2026-05-05", startHour:7, status:"completed", jobs:[
    { title:"Custom kitchen cabinetry", clientName:"Sophie Bell", clientPhone:"0490001702", addr:"123 Smith St, Fitzroy VIC 3065", hrs:6, price:4800, vc:3 },
    { title:"Built-in bookshelf", clientName:"Owen Clarke", clientPhone:"0490001702", addr:"32 Lygon St, Carlton VIC 3053", hrs:3, price:1200, vc:2 },
  ]},
  { w:2, date:"2026-05-08", startHour:8, status:"completed", jobs:[
    { title:"Deck balustrade repair", clientName:"Graham Reeves", clientPhone:"0490001702", addr:"12 Auburn Rd, Hawthorn VIC 3122", hrs:3, price:1100, vc:2 },
    { title:"Timber floor repair", clientName:"Lily Pearce", clientPhone:"0490001702", addr:"55 Toorak Rd, South Yarra VIC 3141", hrs:3, price:980, vc:2 },
  ]},
  { w:2, date:"2026-05-12", startHour:8, status:"completed", jobs:[
    { title:"Study room built-ins", clientName:"Jack Vickers", clientPhone:"0490001702", addr:"67 Burke Rd, Camberwell VIC 3124", hrs:4, price:1850, vc:2 },
    { title:"Staircase timber cladding", clientName:"Renee Grant", clientPhone:"0490001702", addr:"8 High St, Kew VIC 3101", hrs:4, price:2100, vc:3 },
  ]},
  { w:2, date:"2026-05-19", startHour:8, status:"confirmed", jobs:[
    { title:"Pergola frame construction", clientName:"Tomas Silva", clientPhone:"0490001702", addr:"180 Bridge Rd, Richmond VIC 3121", hrs:5, price:3600, vc:2 },
    { title:"Fence panel replacement", clientName:"Pat Kelly", clientPhone:"0490001702", addr:"18 Johnston St, Collingwood VIC 3066", hrs:3, price:1100, vc:1 },
  ]},
  { w:2, date:"2026-05-20", startHour:8, status:"confirmed", jobs:[
    { title:"Reception desk — commercial fitout", clientName:"BluePeak Consulting", clientPhone:"0490001702", addr:"500 Bourke St, Melbourne VIC 3000", hrs:6, price:5400, vc:3, numTradies:2 },
    { title:"Boardroom cabinetry", clientName:"BluePeak Consulting", clientPhone:"0490001702", addr:"500 Bourke St, Melbourne VIC 3000", hrs:2, price:1800, vc:3, numTradies:2 },
  ]},
  { w:2, date:"2026-05-26", startHour:8, status:"pending", jobs:[
    { title:"Home office renovation", clientName:"Rita Hanson", clientPhone:"0490001702", addr:"25 Doncaster Rd, Doncaster VIC 3108", hrs:4, price:2200, vc:2 },
    { title:"Pergola decking", clientName:"Sam Yeo", clientPhone:"0490001702", addr:"1 Albany St, Box Hill VIC 3128", hrs:3, price:1500, vc:2 },
  ]},
  { w:2, date:"2026-05-28", startHour:8, status:"pending", jobs:[
    { title:"Custom wardrobe — master bedroom", clientName:"Connor Walsh", clientPhone:"0490001702", addr:"45 Whitehorse Rd, Balwyn VIC 3103", hrs:5, price:2800, vc:2 },
    { title:"Laundry fitout", clientName:"Moira Flynn", clientPhone:"0490001702", addr:"67 Burke Rd, Camberwell VIC 3124", hrs:2.5, price:900, vc:1 },
  ]},

  // ════════════════════════════════════════════════════════════════════════════
  // EMMA THOMPSON — Painter
  // ════════════════════════════════════════════════════════════════════════════
  { w:3, date:"2026-05-05", startHour:7, status:"completed", jobs:[
    { title:"Interior repaint — 2BR unit", clientName:"Claire Dubois", clientPhone:"0490001702", addr:"32 Lygon St, Carlton VIC 3053", hrs:7, price:2100, vc:2 },
    { title:"Feature wall — lounge", clientName:"Marcus Webb", clientPhone:"0490001702", addr:"123 Smith St, Fitzroy VIC 3065", hrs:3, price:680, vc:1 },
  ]},
  { w:3, date:"2026-05-07", startHour:7, status:"completed", jobs:[
    { title:"Exterior trim repaint", clientName:"Daniel Rowe", clientPhone:"0490001702", addr:"55 Toorak Rd, South Yarra VIC 3141", hrs:5, price:2400, vc:2 },
    { title:"Bathroom repaint", clientName:"Susanna Price", clientPhone:"0490001702", addr:"78 Acland St, St Kilda VIC 3182", hrs:3, price:760, vc:1 },
  ]},
  { w:3, date:"2026-05-12", startHour:7, status:"completed", jobs:[
    { title:"3-bedroom house interior", clientName:"Henry Wallace", clientPhone:"0490001702", addr:"15 Johnston St, Collingwood VIC 3066", hrs:7, price:3200, vc:3, numTradies:2 },
    { title:"Staircase & hallway repaint", clientName:"Yuki Tanaka", clientPhone:"0490001702", addr:"100 High St, Northcote VIC 3070", hrs:4, price:1100, vc:2 },
  ]},
  { w:3, date:"2026-05-19", startHour:7, status:"confirmed", jobs:[
    { title:"Apartment interior — full repaint", clientName:"Leo Stern", clientPhone:"0490001702", addr:"180 Bridge Rd, Richmond VIC 3121", hrs:7, price:2800, vc:2 },
    { title:"Fence paint — front", clientName:"Anna Kovalev", clientPhone:"0490001702", addr:"22 Victoria St, Abbotsford VIC 3067", hrs:3, price:650, vc:1 },
  ]},
  { w:3, date:"2026-05-22", startHour:8, status:"confirmed", jobs:[
    { title:"Victorian home exterior repaint", clientName:"Paul Barker", clientPhone:"0490001702", addr:"12 Auburn Rd, Hawthorn VIC 3122", hrs:6, price:3800, vc:3 },
    { title:"Sunroom interior", clientName:"Cora Newton", clientPhone:"0490001702", addr:"8 High St, Kew VIC 3101", hrs:2.5, price:680, vc:1 },
  ]},
  { w:3, date:"2026-05-27", startHour:7, status:"pending", jobs:[
    { title:"Weatherboard exterior — full", clientName:"Tanya Brennan", clientPhone:"0490001702", addr:"38 Were St, Brighton VIC 3186", hrs:7, price:5200, vc:3 },
    { title:"Garage walls & ceiling", clientName:"Rob Stanley", clientPhone:"0490001702", addr:"25 Orrong Rd, Caulfield VIC 3162", hrs:3, price:820, vc:1 },
  ]},
  { w:3, date:"2026-05-29", startHour:7, status:"pending", jobs:[
    { title:"Commercial office repaint", clientName:"Prestige Realty", clientPhone:"0490001702", addr:"78 Glenferrie Rd, Malvern VIC 3144", hrs:7, price:3400, vc:2, numTradies:2 },
    { title:"Retail shopfront repaint", clientName:"Oak & Stone Café", clientPhone:"0490001702", addr:"54 High St, Armadale VIC 3143", hrs:3, price:850, vc:1 },
  ]},

  // ════════════════════════════════════════════════════════════════════════════
  // DANIEL MURPHY — HVAC
  // ════════════════════════════════════════════════════════════════════════════
  { w:4, date:"2026-05-06", startHour:8, status:"completed", jobs:[
    { title:"Split system installation", clientName:"Lily Pearce", clientPhone:"0490001702", addr:"55 Toorak Rd, South Yarra VIC 3141", hrs:3, price:1800, vc:2 },
    { title:"AC service & filter clean", clientName:"Bruce Carver", clientPhone:"0490001702", addr:"3 Albany Rd, Toorak VIC 3142", hrs:2, price:480, vc:1 },
  ]},
  { w:4, date:"2026-05-08", startHour:8, status:"completed", jobs:[
    { title:"Ducted AC commissioning — office", clientName:"NextStep Pty Ltd", clientPhone:"0490001702", addr:"350 Collins St, Melbourne VIC 3000", hrs:5, price:3200, vc:3 },
    { title:"Server room cooling unit", clientName:"DataCore Pty Ltd", clientPhone:"0490001702", addr:"111 Flinders St, Melbourne VIC 3000", hrs:3, price:2100, vc:3 },
  ]},
  { w:4, date:"2026-05-13", startHour:8, status:"completed", jobs:[
    { title:"Reverse-cycle installation", clientName:"Jack Vickers", clientPhone:"0490001702", addr:"67 Burke Rd, Camberwell VIC 3124", hrs:3, price:1950, vc:2 },
    { title:"HVAC inspection report", clientName:"Lena Chambers", clientPhone:"0490001702", addr:"12 Auburn Rd, Hawthorn VIC 3122", hrs:2, price:550, vc:1 },
  ]},
  { w:4, date:"2026-05-19", startHour:8, status:"confirmed", jobs:[
    { title:"3x split system install", clientName:"Sofia Rossi", clientPhone:"0490001702", addr:"32 Lygon St, Carlton VIC 3053", hrs:5, price:4200, vc:3, numTradies:2 },
    { title:"Ducted gas heater service", clientName:"Ethan Brooks", clientPhone:"0490001702", addr:"89 Sydney Rd, Brunswick VIC 3056", hrs:2, price:480, vc:2 },
  ]},
  { w:4, date:"2026-05-21", startHour:8, status:"confirmed", jobs:[
    { title:"Large commercial HVAC — stage 1", clientName:"Lonsdale Medical Centre", clientPhone:"0490001702", addr:"180 Lonsdale St, Melbourne VIC 3000", hrs:7, price:8500, vc:3, numTradies:2 },
    { title:"Exhaust fan replacement", clientName:"Pier Hotel", clientPhone:"0490001702", addr:"43 Waterfront Way, Docklands VIC 3008", hrs:2, price:580, vc:1 },
  ]},
  { w:4, date:"2026-05-26", startHour:9, status:"pending", jobs:[
    { title:"Ducted system — new home", clientName:"Robert Hirano", clientPhone:"0490001702", addr:"123 Springvale Rd, Glen Waverley VIC 3150", hrs:6, price:7200, vc:3 },
    { title:"Zone controller install", clientName:"Sam Yeo", clientPhone:"0490001702", addr:"1 Albany St, Box Hill VIC 3128", hrs:2.5, price:980, vc:2 },
  ]},
  { w:4, date:"2026-05-28", startHour:9, status:"pending", jobs:[
    { title:"Commercial AC service — annual", clientName:"Harborside Café", clientPhone:"0490001702", addr:"90 Bay St, Port Melbourne VIC 3207", hrs:3, price:760, vc:2 },
    { title:"Split system — bedroom", clientName:"Zoe Farrow", clientPhone:"0490001702", addr:"78 Glenferrie Rd, Malvern VIC 3144", hrs:2, price:1200, vc:1 },
  ]},

  // ════════════════════════════════════════════════════════════════════════════
  // OLIVIA BROWN — General Builder
  // ════════════════════════════════════════════════════════════════════════════
  { w:5, date:"2026-05-05", startHour:7, status:"completed", jobs:[
    { title:"Office fitout — walls & ceiling", clientName:"BluePeak Consulting", clientPhone:"0490001702", addr:"500 Bourke St, Melbourne VIC 3000", hrs:7, price:6800, vc:3, numTradies:2 },
    { title:"Partition wall installation", clientName:"Axis Co-work", clientPhone:"0490001702", addr:"350 Collins St, Melbourne VIC 3000", hrs:3, price:1800, vc:2 },
  ]},
  { w:5, date:"2026-05-08", startHour:8, status:"completed", jobs:[
    { title:"Deck construction assist", clientName:"Graham Reeves", clientPhone:"0490001702", addr:"12 Auburn Rd, Hawthorn VIC 3122", hrs:4, price:2200, vc:2, numTradies:2 },
    { title:"Carport concrete slab", clientName:"Gus Franklin", clientPhone:"0490001702", addr:"180 Bridge Rd, Richmond VIC 3121", hrs:4, price:2400, vc:2 },
  ]},
  { w:5, date:"2026-05-13", startHour:8, status:"completed", jobs:[
    { title:"Heritage render repair", clientName:"City of Melbourne", clientPhone:"0490001702", addr:"15 Johnston St, Collingwood VIC 3066", hrs:4, price:1800, vc:2 },
    { title:"Terrace structural brickwork", clientName:"Patricia Hale", clientPhone:"0490001702", addr:"77 Napier St, Fitzroy VIC 3065", hrs:3, price:1600, vc:2 },
  ]},
  { w:5, date:"2026-05-20", startHour:7, status:"confirmed", jobs:[
    { title:"Commercial fitout — stage 2", clientName:"BluePeak Consulting", clientPhone:"0490001702", addr:"500 Bourke St, Melbourne VIC 3000", hrs:7, price:7500, vc:3, numTradies:2 },
    { title:"Raised floor platform", clientName:"DataCore Pty Ltd", clientPhone:"0490001702", addr:"111 Flinders St, Melbourne VIC 3000", hrs:3, price:2100, vc:3 },
  ]},
  { w:5, date:"2026-05-22", startHour:8, status:"confirmed", jobs:[
    { title:"Retail fitout — full strip & rebuild", clientName:"Urban Goods Co.", clientPhone:"0490001702", addr:"12 Hopkins St, Footscray VIC 3011", hrs:7, price:9800, vc:3, numTradies:2 },
    { title:"Boundary fence rebuild", clientName:"Steph Murray", clientPhone:"0490001702", addr:"56 Ferguson St, Williamstown VIC 3016", hrs:3, price:1400, vc:1 },
  ]},
  { w:5, date:"2026-05-26", startHour:8, status:"pending", jobs:[
    { title:"Ground floor extension frame", clientName:"Ian Rosenberg", clientPhone:"0490001702", addr:"22 Swan St, Richmond VIC 3121", hrs:6, price:5400, vc:3 },
    { title:"Bathroom waterproofing", clientName:"Sophie Bell", clientPhone:"0490001702", addr:"123 Smith St, Fitzroy VIC 3065", hrs:2.5, price:880, vc:2 },
  ]},

  // ════════════════════════════════════════════════════════════════════════════
  // RYAN PATEL — Roofer
  // ════════════════════════════════════════════════════════════════════════════
  { w:6, date:"2026-05-05", startHour:7, status:"completed", jobs:[
    { title:"Ridge capping repoint", clientName:"Lena Chambers", clientPhone:"0490001702", addr:"8 High St, Kew VIC 3101", hrs:3, price:850, vc:2 },
    { title:"Gutter replacement — side", clientName:"Paul Barker", clientPhone:"0490001702", addr:"12 Auburn Rd, Hawthorn VIC 3122", hrs:3.5, price:1100, vc:1 },
  ]},
  { w:6, date:"2026-05-07", startHour:7, status:"completed", jobs:[
    { title:"Roof tile replacement — storm damage", clientName:"Vera Coleman", clientPhone:"0490001702", addr:"67 Burke Rd, Camberwell VIC 3124", hrs:4, price:1600, vc:2 },
    { title:"Colorbond roof inspection", clientName:"Ian Rosenberg", clientPhone:"0490001702", addr:"45 Whitehorse Rd, Balwyn VIC 3103", hrs:2, price:460, vc:1 },
  ]},
  { w:6, date:"2026-05-12", startHour:7, status:"completed", jobs:[
    { title:"Tile & gutter clean", clientName:"Celia Shaw", clientPhone:"0490001702", addr:"38 Were St, Brighton VIC 3186", hrs:3, price:680, vc:1 },
    { title:"Roof valley repair", clientName:"Hugh Grant", clientPhone:"0490001702", addr:"15 Hampton St, Hampton VIC 3188", hrs:3, price:920, vc:2 },
  ]},
  { w:6, date:"2026-05-19", startHour:7, status:"confirmed", jobs:[
    { title:"Full roof re-sheet — Colorbond", clientName:"Marcus Okafor", clientPhone:"0490001702", addr:"100 High St, Northcote VIC 3070", hrs:7, price:8500, vc:3, numTradies:2 },
    { title:"Gutter guard installation", clientName:"Terry Ling", clientPhone:"0490001702", addr:"45 St Georges Rd, Thornbury VIC 3071", hrs:3, price:1100, vc:2 },
  ]},
  { w:6, date:"2026-05-21", startHour:7, status:"confirmed", jobs:[
    { title:"New roof — extension", clientName:"Gary Newton", clientPhone:"0490001702", addr:"Spring St, Preston VIC 3072", hrs:7, price:7200, vc:3, numTradies:2 },
    { title:"Downpipe replacement", clientName:"Monica Blaine", clientPhone:"0490001702", addr:"88 Broadway, Reservoir VIC 3073", hrs:2, price:480, vc:1 },
  ]},
  { w:6, date:"2026-05-26", startHour:7, status:"pending", jobs:[
    { title:"Heritage slate repair", clientName:"Derek Lawson", clientPhone:"0490001702", addr:"34 Buckley St, Essendon VIC 3040", hrs:5, price:3200, vc:3 },
    { title:"Fascia & gutter replacement", clientName:"Fiona McCarthy", clientPhone:"0490001702", addr:"36 Douglas Pde, Williamstown VIC 3016", hrs:4, price:1600, vc:2 },
  ]},
  { w:6, date:"2026-05-28", startHour:7, status:"pending", jobs:[
    { title:"Roof restoration — full coat", clientName:"Bob Dempsey", clientPhone:"0490001702", addr:"12 Hopkins St, Footscray VIC 3011", hrs:6, price:4200, vc:2 },
    { title:"Solar panel frame preparation", clientName:"Oscar Tan", clientPhone:"0490001702", addr:"23 Buckley St, Moonee Ponds VIC 3039", hrs:3, price:980, vc:2 },
  ]},

  // ════════════════════════════════════════════════════════════════════════════
  // JESSICA WILLIAMS — Landscaper
  // ════════════════════════════════════════════════════════════════════════════
  { w:7, date:"2026-05-06", startHour:8, status:"completed", jobs:[
    { title:"Garden redesign — rear yard", clientName:"Damien Ashford", clientPhone:"0490001702", addr:"3 Albany Rd, Toorak VIC 3142", hrs:5, price:3400, vc:3 },
    { title:"Lawn top dress & seed", clientName:"Lily Pearce", clientPhone:"0490001702", addr:"55 Toorak Rd, South Yarra VIC 3141", hrs:2.5, price:620, vc:1 },
  ]},
  { w:7, date:"2026-05-08", startHour:8, status:"completed", jobs:[
    { title:"Pool surround landscaping", clientName:"Celia Shaw", clientPhone:"0490001702", addr:"38 Were St, Brighton VIC 3186", hrs:6, price:4800, vc:3 },
    { title:"Hedge planting & mulch", clientName:"Hugh Grant", clientPhone:"0490001702", addr:"15 Hampton St, Hampton VIC 3188", hrs:3, price:780, vc:1 },
  ]},
  { w:7, date:"2026-05-13", startHour:8, status:"completed", jobs:[
    { title:"Japanese garden install", clientName:"Cora Newton", clientPhone:"0490001702", addr:"67 Burke Rd, Camberwell VIC 3124", hrs:5, price:3200, vc:3 },
    { title:"Raised vegetable beds", clientName:"Rita Hanson", clientPhone:"0490001702", addr:"25 Doncaster Rd, Doncaster VIC 3108", hrs:3, price:900, vc:2 },
  ]},
  { w:7, date:"2026-05-20", startHour:8, status:"confirmed", jobs:[
    { title:"Native front garden redesign", clientName:"Aisha Okonkwo", clientPhone:"0490001702", addr:"123 Springvale Rd, Glen Waverley VIC 3150", hrs:5, price:3400, vc:2 },
    { title:"Drip irrigation install", clientName:"Tony Fox", clientPhone:"0490001702", addr:"45 Princes Hwy, Clayton VIC 3168", hrs:3, price:1200, vc:2 },
  ]},
  { w:7, date:"2026-05-22", startHour:8, status:"confirmed", jobs:[
    { title:"Retaining wall + planting", clientName:"Sandy Carr", clientPhone:"0490001702", addr:"39 Bedford Rd, Ringwood VIC 3134", hrs:6, price:4100, vc:3 },
    { title:"Lawn re-turfing", clientName:"Wayne Briggs", clientPhone:"0490001702", addr:"Mitcham Rd, Vermont VIC 3133", hrs:3, price:1050, vc:1 },
  ]},
  { w:7, date:"2026-05-27", startHour:8, status:"pending", jobs:[
    { title:"Garden renovation — front & rear", clientName:"Zoe Farrow", clientPhone:"0490001702", addr:"78 Glenferrie Rd, Malvern VIC 3144", hrs:5, price:2800, vc:2 },
    { title:"Paving & gravel path", clientName:"Joel Stein", clientPhone:"0490001702", addr:"54 High St, Armadale VIC 3143", hrs:3, price:1400, vc:2 },
  ]},
  { w:7, date:"2026-05-29", startHour:8, status:"pending", jobs:[
    { title:"Pool area garden + lighting", clientName:"Damien Ashford", clientPhone:"0490001702", addr:"3 Albany Rd, Toorak VIC 3142", hrs:5, price:5200, vc:3 },
    { title:"Courtyard garden — townhouse", clientName:"Nina Walsh", clientPhone:"0490001702", addr:"55 Toorak Rd, South Yarra VIC 3141", hrs:3, price:1600, vc:2 },
  ]},

]; // end SCHEDULE

// ── Quotes (scattered through May, unassigned) ────────────────────────────────

const QUOTES = [
  { title:"Heritage home rewire quote",          clientName:"Patricia Hale",    clientPhone:"0490001702", clientEmail:"patricia.hale@gmail.com",   addr:"77 Napier St, Fitzroy VIC 3065",          tradeType:"Electrician",    price:5200, hrs:10, vc:2 as const, date:"2026-05-11" },
  { title:"New Colorbond roof quote",            clientName:"Ian Rosenberg",    clientPhone:"0490001702", clientEmail:"ian.rosenberg@gmail.com",    addr:"22 Swan St, Richmond VIC 3121",           tradeType:"Roofer",         price:15000,hrs:12, vc:1 as const, date:"2026-05-14" },
  { title:"Whole-house interior paint quote",    clientName:"Zoe Farrow",       clientPhone:"0490001702", clientEmail:"zoe.farrow@gmail.com",       addr:"38 Were St, Brighton VIC 3186",           tradeType:"Painter",        price:6800, hrs:16, vc:2 as const, date:"2026-05-18" },
  { title:"Pool area landscaping quote",         clientName:"Damien Ashford",   clientPhone:"0490001702", clientEmail:"damien.ashford@gmail.com",   addr:"3 Albany Rd, Toorak VIC 3142",            tradeType:"Landscaper",     price:9500, hrs:12, vc:3 as const, date:"2026-05-20" },
  { title:"Commercial HVAC design quote",        clientName:"Lonsdale Medical", clientPhone:"0490001702", clientEmail:"admin@lonsdalemedical.com.au",addr:"180 Lonsdale St, Melbourne VIC 3000",     tradeType:"HVAC",           price:24000,hrs:16, vc:3 as const, date:"2026-05-22" },
  { title:"Custom kitchen joinery quote",        clientName:"Mary Sutton",      clientPhone:"0490001702", clientEmail:"mary.sutton@gmail.com",      addr:"67 Burke Rd, Camberwell VIC 3124",        tradeType:"Carpenter",      price:8500, hrs:14, vc:2 as const, date:"2026-05-23" },
  { title:"New hot water system quote",          clientName:"Ron Castle",       clientPhone:"0490001702", clientEmail:"ron.castle@gmail.com",       addr:"100 High St, Northcote VIC 3070",         tradeType:"Plumber",        price:2800, hrs:4,  vc:1 as const, date:"2026-05-25" },
  { title:"3-phase power upgrade quote",         clientName:"Riverside Gym",    clientPhone:"0490001702", clientEmail:"info@riversidegym.com.au",   addr:"90 Bay St, Port Melbourne VIC 3207",      tradeType:"Electrician",    price:6400, hrs:8,  vc:3 as const, date:"2026-05-27" },
];

// ── Seed function ─────────────────────────────────────────────────────────────

async function seed() {
  console.log("🗑️  Clearing existing data...");
  await db.execute(sql`UPDATE users SET worker_id = NULL WHERE worker_id IS NOT NULL`);
  await db.execute(sql`DELETE FROM leave_requests`);
  await db.execute(sql`DELETE FROM jobs`);
  await db.execute(sql`DELETE FROM workers`);

  console.log("👷 Inserting workers...");
  const rows = await db.insert(workersTable).values(WORKERS).returning({ id: workersTable.id });
  const wids = rows.map(r => r.id);
  console.log(`   IDs: ${wids.join(", ")}`);

  // Pre-fetch all travel times
  console.log("\n🗺  Pre-fetching travel times from Google Maps...");
  const pairs = new Set<string>();
  for (const day of SCHEDULE) {
    for (let i = 0; i + 1 < day.jobs.length; i++) {
      pairs.add(`${day.jobs[i].addr}|||${day.jobs[i + 1].addr}`);
    }
  }
  for (const pair of pairs) {
    const [from, to] = pair.split("|||");
    await travelMins(from, to);
  }

  // Build and insert jobs
  console.log("\n🏗️  Inserting jobs...");
  const jobRecords: any[] = [];

  for (const day of SCHEDULE) {
    const workerId = wids[day.w];
    let cursor = new Date(mel(day.date, day.startHour));
    let incomingTravel: number | null = null;

    for (let i = 0; i < day.jobs.length; i++) {
      const j = day.jobs[i];
      const startIso = cursor.toISOString();
      const isEmergency = j.title.startsWith("CODE 9");
      const isCompleted = day.status === "completed";
      const isInProgress = day.status === "in_progress";
      const sub = suburb(j.addr);

      let attendance = "[]";
      if (isCompleted) {
        attendance = mkAttendance(workerId, startIso, j.hrs, sub);
      } else if (isInProgress) {
        attendance = mkPartialAttendance(workerId, startIso, sub);
      }

      jobRecords.push({
        jobType:          "booking" as const,
        validityCode:     j.vc,
        title:            j.title,
        clientName:       j.clientName,
        clientPhone:      j.clientPhone,
        address:          j.addr,
        tradeType:        WORKERS[day.w].tradeType,
        price:            j.price,
        estimatedHours:   j.hrs,
        numTradies:       j.numTradies ?? 1,
        status:           day.status as any,
        scheduledDate:    startIso,
        completedDate:    isCompleted ? addHrs(startIso, j.hrs) : null,
        assignedWorkerIds: JSON.stringify([workerId]),
        attendanceJson:   attendance,
        isEmergency,
        notes:            j.notes ?? null,
        requiredSkillsJson: "[]",
        materialsJson:    "[]",
        imageUrls:        "[]",
        travelTimeMinutes: incomingTravel,
      });

      // Advance time: job duration + travel to next job
      cursor = new Date(cursor.getTime() + j.hrs * 3_600_000);
      if (i + 1 < day.jobs.length) {
        const travel = await travelMins(j.addr, day.jobs[i + 1].addr);
        incomingTravel = travel;
        cursor = new Date(cursor.getTime() + travel * 60_000);
      } else {
        incomingTravel = null;
      }
    }
  }

  // Add quotes
  for (const q of QUOTES) {
    jobRecords.push({
      jobType:          "quote" as const,
      validityCode:     q.vc,
      title:            q.title,
      clientName:       q.clientName,
      clientPhone:      q.clientPhone,
      clientEmail:      q.clientEmail,
      address:          q.addr,
      tradeType:        q.tradeType,
      price:            q.price,
      estimatedHours:   q.hrs,
      numTradies:       1,
      status:           "pending" as const,
      scheduledDate:    `${q.date}`,
      completedDate:    null,
      assignedWorkerIds: "[]",
      attendanceJson:   "[]",
      requiredSkillsJson: "[]",
      materialsJson:    "[]",
      imageUrls:        "[]",
    });
  }

  await db.insert(jobsTable).values(jobRecords);

  const cnt = await db.execute(sql`SELECT COUNT(*) FROM jobs`);
  console.log(`\n✅ Done — ${(cnt.rows[0] as any).count} jobs inserted for ${wids.length} workers.`);
  await pool.end();
}

seed().catch(e => { console.error(e); process.exit(1); });

