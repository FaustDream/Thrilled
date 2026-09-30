/**
 * 061129 壁纸数据解码映射（Wallpaper Gallery，MIT License）
 * 来源：github.com/IT-NuanxinPro/wallpaper-gallery src/utils/common/codec-config.js
 * 编码 = Base64 + 字符映射 + 反转；解码映射为其反转（编→原）。
 */

/** 版本前缀 */
export const BLOB_PREFIX = "v1.";

/** 解码字符映射（编码字符 → 原 Base64 字符） */
export const CHAR_MAP_DECODE: Record<string, string> = {
  "Q": "A",
  "W": "B",
  "E": "C",
  "R": "D",
  "T": "E",
  "Y": "F",
  "U": "G",
  "I": "H",
  "O": "I",
  "P": "J",
  "A": "K",
  "S": "L",
  "D": "M",
  "F": "N",
  "G": "O",
  "H": "P",
  "J": "Q",
  "K": "R",
  "L": "S",
  "Z": "T",
  "X": "U",
  "C": "V",
  "V": "W",
  "B": "X",
  "N": "Y",
  "M": "Z",
  "q": "a",
  "w": "b",
  "e": "c",
  "r": "d",
  "t": "e",
  "y": "f",
  "u": "g",
  "i": "h",
  "o": "i",
  "p": "j",
  "a": "k",
  "s": "l",
  "d": "m",
  "f": "n",
  "g": "o",
  "h": "p",
  "j": "q",
  "k": "r",
  "l": "s",
  "z": "t",
  "x": "u",
  "c": "v",
  "v": "w",
  "b": "x",
  "n": "y",
  "m": "z",
  "5": "0",
  "6": "1",
  "7": "2",
  "8": "3",
  "9": "4",
  "0": "5",
  "1": "6",
  "2": "7",
  "3": "8",
  "4": "9",
  "-": "+",
  "_": "/",
  ".": "=",
};

/** 解码 blob 数据为原始 JSON 字符串 */
export const decodeBlob = (encoded: string): string => {
  if (!encoded.startsWith(BLOB_PREFIX)) throw new Error('数据格式无效');
  const reversed = encoded.slice(BLOB_PREFIX.length).split('').reverse().join('');
  const base64 = reversed.split('').map((c) => CHAR_MAP_DECODE[c] ?? c).join('');
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};
