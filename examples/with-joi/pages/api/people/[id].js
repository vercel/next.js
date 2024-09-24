import Joi from "joi";
import { createRouter } from "next-connect";
import { validate } from "../../../server/api/middlewares/validate";

const router = createRouter();
router.get(
  validate({
    query: Joi.object({
      id: Joi.string().uuid().required(),
    }),
  }),
  (req, res) => {
    const id = req.query.id;

    return res.status(200).json({
      data: {
        id,
      },
    });
  },
);

export default router.handler({
  onError: (err, req, res) => {
    console.error(err.stack);
    res.status(err.statusCode || 500).end(err.message);
  },
});
