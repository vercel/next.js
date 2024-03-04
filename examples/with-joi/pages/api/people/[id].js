import Joi from "joi";
import connect from "next-connect";
import { validate } from "../../../server/api/middlewares/validate";

export default connect().get(
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
