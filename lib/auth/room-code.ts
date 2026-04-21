import { customAlphabet } from "nanoid";

const digits = "0123456789";
const generateCode = customAlphabet(digits, 6);

export function createRoomCode() {
  return generateCode();
}
