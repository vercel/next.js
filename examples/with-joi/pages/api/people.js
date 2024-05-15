import Joi from "joi";
import { createRouter } from "next-connect";
import { validate } from "../../server/api/middlewares/validate";

const router = createRouter();

const personSchema = Joi.object({
  age: Joi.number().required(),
  name: Joi.string().required(),
});

router.post(validate({ body: personSchema }), (req, res) => {
  const person = req.body;

  return res.status(201).json({ data: person });
});

export default router.handler({
  onError: (err, req, res) => {
    console.error(err.stack);
    res.status(err.statusCode || 500).end(err.message);
  },
});
