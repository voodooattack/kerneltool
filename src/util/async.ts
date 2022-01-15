import promiseSequential from "promise-sequential";

export const asyncFilter = async <T>(arr: T[], callbackfn: (value: T, index: number, array: T[]) => any) =>
  Promise.all(arr.map((v, i, a) => async () => callbackfn(v, i, a))).then(results =>
    arr.filter((_v, index) => results[index])
  );

export const asyncFilterSeq = async <T>(arr: T[], callbackfn: (value: T, index: number, array: T[]) => any) =>
  promiseSequential(arr.map((v, i, a) => async () => callbackfn(v, i, a))).then(results =>
    arr.filter((_v, index) => results[index])
  );
