import { Router, type IRouter, type Request, type Response } from "express";
import { reverseGeocodeSuburb } from "../lib/maps";

const router: IRouter = Router();

// GET /api/geo/suburb?lat=...&lng=...
router.get("/suburb", async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: "lat and lng are required" });
    return;
  }

  try {
    const suburb = await reverseGeocodeSuburb(lat, lng);
    res.json({ suburb });
  } catch (err) {
    console.error("[geo] suburb lookup error:", err);
    res.status(500).json({ error: "Could not determine suburb" });
  }
});

export default router;
