// Opaque structural tokens, NOT study questions, financial content or demonstration data.
// These never ship in the application bundle or its question bank.
import { TOPICS, fresh, importBank } from "../src/model.js";
export const fixture = (id = "record-1", fixed = false) => ({
  id,
  topic: TOPICS[0],
  module: "__MODULE__",
  text: "__SOURCE_TEXT__ " + id,
  options: [
    { id: "option-x", text: "__OPTION_X__" },
    { id: "option-y", text: "__OPTION_Y__" },
    { id: "option-z", text: "__OPTION_Z__" },
  ],
  correctOptionId: "option-y",
  preserveOrder: fixed,
  explanation: null,
  status: "validated",
  verifiedBy: "__TEST_ONLY__",
  materials: [],
  requiredMaterialIds: [],
  sources: [
    {
      category: "curriculum",
      title: "__SOURCE__",
      edition: "__EDITION__",
      year: "__YEAR__",
      location: "__LOCATION__",
      answerLocation: "__ANSWER_LOCATION__",
    },
  ],
});
export const loaded = (...records) =>
  importBank(fresh(), {
    version: 1,
    questions: records.length ? records : [fixture()],
  }).state;
