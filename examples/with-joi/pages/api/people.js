import Joi from "joi";
import connect from "next-connect";
import { validate } from "../../server/api/middlewares/validate";

const personSchema = Joi.object({
  age: Joi.number().required(),
  name: Joi.string().required(),
});

export default connect().post(validate({ body: personSchema }), (req, res) => {
  const person = req.body;

  return res.status(201).json({ data: person });
});
