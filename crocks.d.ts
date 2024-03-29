/**
 * Not Implementing all types for Crocks,
 * just what we need/use
 *
 * Copied from:
 * https://github.com/hyper63/hyper/blob/main/packages/core/crocks.d.ts
 *
 * TODO: should hyper create a module for Crocks types?
 */

export type NullaryFunction<R> = () => R
export type UnaryFunction<Arg, R> = (arg: Arg) => R
export type VariadicFunction<Arg, R> = (...args: ReadonlyArray<Arg>) => R

/**
 * Technically Functor and Monad, but
 * I'm not going to break out Functor
 */
interface Monad<RootV> {
  map<V>(fn: UnaryFunction<RootV, V>): Monad<V>

  chain<V>(fn: UnaryFunction<RootV, Monad<V>>): Monad<V>
}

interface Sum<RootLeft, RootRight> extends Monad<RootRight> {
  bimap<Left, Right>(
    l: UnaryFunction<RootLeft, Left>,
    r: UnaryFunction<RootRight, Right>,
  ): Sum<Left, Right>

  bichain<LeftR, LeftL, RightR, RightL>(
    l: UnaryFunction<RootLeft, Sum<LeftL, RightL>>,
    r: UnaryFunction<RootRight, Sum<LeftR, RightR>>,
  ): Sum<LeftL | LeftR, RightL | RightR>
}

export function Identity<V>(v: V): Identity<V>

export class Identity<RootV> implements Monad<RootV> {
  map<V>(fn: UnaryFunction<RootV, V>): Identity<V>

  chain<V>(fn: UnaryFunction<RootV, Identity<V>>): Identity<V>

  valueOf(): RootV
}

export function Async<Left, Right>(
  fn: (
    reject: UnaryFunction<Left, void>,
    resolve: UnaryFunction<Right, void>,
  ) => unknown,
): Async<Left, Right>

export class Async<RootLeft, RootRight> implements Sum<RootLeft, RootRight> {
  map<Right>(fn: UnaryFunction<RootRight, Right>): Async<RootLeft, Right>

  bimap<Left, Right>(
    l: UnaryFunction<RootLeft, Left>,
    r: UnaryFunction<RootRight, Right>,
  ): Async<Left, Right>

  chain<Left, Right>(
    fn: UnaryFunction<RootRight, Async<Left, Right>>,
  ): Async<Left, Right>

  bichain<LeftR, LeftL, RightR, RightL>(
    l: UnaryFunction<RootLeft, Sum<LeftL, RightL>>,
    r: UnaryFunction<RootRight, Sum<LeftR, RightR>>,
  ): Async<LeftL | LeftR, RightL | RightR>

  fork(
    reject: UnaryFunction<RootLeft, unknown>,
    resolve: UnaryFunction<RootRight, unknown>,
    cancel?: NullaryFunction<void>,
  ): void

  toPromise(): Promise<RootRight>

  static fromPromise<V, R, L>(
    fn: VariadicFunction<V, Promise<R>>,
  ): VariadicFunction<V, Async<L, R>>
  static of<V>(val: V): Async<void, V>
  static Rejected<V, R>(val: V): Async<V, R | void>
  static Resolved<V, L>(val: V): Async<L | void, V>
}

/**
 * Just implementating ReaderT for Async
 * since that's all we use it for
 */
export function ReaderT<A extends Async<L, R>, L, R>(
  monad: new () => A,
): AsyncReader<unknown>

export class AsyncReader<RootV> implements Monad<RootV> {
  map<V>(fn: UnaryFunction<RootV, V>): AsyncReader<V>

  chain<V>(fn: UnaryFunction<RootV, AsyncReader<V>>): AsyncReader<V>

  of<V>(v: V): AsyncReader<V>

  runWith<E, L = unknown>(env: E): Async<L, RootV>
  /**
   * The function passed to ask() should return an Async,
   *
   * But the Async is not folded into the ReaderT itself.
   * To do that, we must call lift().
   *
   * This would be similar to having a Promise<Promise<...>>
   * and having to call p.then(innerp => innerp.then(...)),
   *
   * However, that is not possible with Promises
   * because they implicitly flatten,
   * whereas a ReaderT created via ask() does not.
   */
  ask<E, V, L = unknown>(
    fn: UnaryFunction<E, Async<L, V>>,
  ): AsyncReader<Async<L, V>>
  lift<V, L = unknown>(a: Async<L, V>): AsyncReader<V>
}

export class Either<RootLeft, RootRight> implements Sum<RootLeft, RootRight> {
  map<Right>(fn: UnaryFunction<RootRight, Right>): Either<RootLeft, Right>

  bimap<Left, Right>(
    l: UnaryFunction<RootLeft, Left>,
    r: UnaryFunction<RootRight, Right>,
  ): Either<Left, Right>

  chain<Left, Right>(
    fn: UnaryFunction<RootRight, Async<Left, Right>>,
  ): Either<Left, Right>

  bichain<LeftR, LeftL, RightR, RightL>(
    l: UnaryFunction<RootLeft, Sum<LeftL, RightL>>,
    r: UnaryFunction<RootRight, Sum<LeftR, RightR>>,
  ): Either<LeftL | LeftR, RightL | RightR>

  static Left<V>(val: V): Either<V, void>
  static Right<V>(val: V): Either<void, V>
}

export function eitherToAsync<L, R>(either: Either<L, R>): Async<L, R>

/**
 * Keeping this simple for now
 */
export function compose<A, R>(
  ...fns: ((a: unknown) => unknown)[]
): (arg: A) => R
