"use client";

import { useEffect } from "react";

const YO_ASCII = String.raw`
YY   YY   OOOOO
 YY YY   OO   OO
  YYY    OO   OO
  YYY    OO   OO
  YYY     OOOOO
`;

const BOTTOM_LINE =
  "Hello Friend! Hope you are having a great day, don't forget to drink";

export function UseConsoleYo() {
  useEffect(() => {
    console.log(YO_ASCII);
    console.log(BOTTOM_LINE);
  }, []);

  return null;
}
