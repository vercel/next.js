import Joi from "joi";
import { validate } from "../../server/api/middlewares/validate";

const carSchema = Joi.object({
  brand: Joi.string().required(),
  model: Joi.string().required(),
});

export default validate({ body: carSchema }, (req, res) => {
  const car = req.body;

  return res.status(201).json({ data: car });
});
