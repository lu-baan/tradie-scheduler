import { Router, type IRouter } from "express";
import healthRouter from "./health";
import jobsRouter from "./jobs";
import workersRouter from "./workers";
import authRouter from "./auth";
import geoRouter from "./geo";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/jobs", jobsRouter);
router.use("/workers", workersRouter);
router.use("/auth", authRouter);
router.use("/geo", geoRouter);

export default router;
