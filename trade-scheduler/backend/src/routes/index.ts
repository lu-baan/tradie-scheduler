import { Router, type IRouter } from "express";
import healthRouter from "./health";
import jobsRouter from "./jobs";
import workersRouter from "./workers";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/jobs", jobsRouter);
router.use("/workers", workersRouter);

export default router;
