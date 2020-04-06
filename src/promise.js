/**
 * Promise A+ 规范实现
 **/

// 定义三个常量表示 Promise 的状态
// 等待状态 可以变更为成功或失败
const PENDING = 'PENDING'
// 成功状态
const RESOLVED = 'RESOLVED'
// 失败状态
const REJECTED = 'REJECTED'

/**
 * 工具方法
 **/
function isFunction(v) {
  return typeof v === 'function'
}
function isObject(v) {
  return typeof v === 'object' && v !== null
}

// 定时器函数
// 为了确保 onFulfilled 和 onRejected 方法异步执行，且应该在 then 方法被调用的那一轮事件循环之后的新执行栈中执行
function nextTick(fn) {
  setTimeout(fn, 0)
}

function resolvePromise(promise2, x, resolve, reject) {
  // promise2 返回结果 x 为自身，应直接执行 reject
  if (promise2 === x) {
    return reject(new TypeError('Error 循环引用'))
  }

  // 设置一个标志位，防止重复调用
  let called = false
  // 判断 x 是不是对象或函数
  if (isObject(x) || isFunction(x)) {
    // 防止取值时出错
    try {
      let then = x.then
      // 如果 then 是一个函数就认为他是一个 promise，如果不是就直接调用 resolve(x)
      if (isFunction(then)) {
        then.call(
          x,
          (y) => {
            if (called) return
            called = true
            // 防止 y 的返回值还是一个 promsie
            resolvePromise(promise2, y, resolve, reject)
          },
          (r) => {
            // 失败结果会向下传递
            if (called) return
            called = true
            reject(r)
          }
        )
      } else {
        resolve(x)
      }
    } catch (error) {
      if (called) return
      called = true
      reject(error)
    }
  } else {
    // x 是一个普通值就直接调用 resolve(x)
    resolve(x)
  }
}

class Promise {
  /**
   * 在 new Promise 的时候会传入一个执行器 (executor) 同时这个执行器是立即执行的
   * state              Promise 的初始状态为等待状态
   * value              成功的值
   * reason             失败的原因
   * resolvedCallbacks  resolve 回调队列
   * rejectedCallbacks  reject 回调队列
   **/
  constructor(executor) {
    this.state = PENDING
    this.value = undefined
    this.reason = undefined

    this.resolvedCallbacks = []
    this.rejectedCallbacks = []

    /**
     * 在 resolve 函数和 reject 函数中
     * 只有等待状态 (pending) 下的 Promise 才能修改状态
     */
    // 成功函数
    const resolve = (value) => {
      nextTick(() => {
        if (this.state === PENDING) {
          this.state = RESOLVED
          this.value = value

          // 执行 resolve 回调队列
          this.resolvedCallbacks.forEach((fn) => fn())
        }
      })
    }

    // 失败函数
    const reject = (reason) => {
      nextTick(() => {
        if (this.state === PENDING) {
          this.state = REJECTED
          this.reason = reason

          // 执行 reject 回调队列
          this.rejectedCallbacks.forEach((fn) => fn())
        }
      })
    }

    /**
     * 执行器 (executor) 接收两个参数，分别是 resolve, reject
     * 为了防止执行器 (executor) 在执行时出错，需要进行错误捕获，并将错误传入 reject 函数
     */
    try {
      executor(resolve, reject)
    } catch (error) {
      reject(error)
    }
  }

  /**
   * then 方法接收两个参数 onFulfilled 和 onRejected
   * onFulfilled 和 onRejected 均为可选参数
   */
  then(onFulfilled, onRejected) {
    onFulfilled = isFunction(onFulfilled) ? onFulfilled : (v) => v
    onRejected = isFunction(onRejected)
      ? onRejected
      : (e) => {
          throw e
        }
    /**
     * 在链式调用时需要返回一个新的 promise
     * 在 then 函数中，无论是成功还是失败的回调，只要返回了结果就会传入下一个 then 的成功回调
     * 如果出现错误就会传入下一个 then 的失败回调
     * 即：下一个 then 的状态和上一个 then 执行时候的状态无关
     * 所以在 then 执行的时候 onFulfilled, onRejected 可能会出现错误，需要捕获错误，并执行失败回调（处理成失败状态）
     */
    const promise2 = new Promise((resolve, reject) => {
      if (this.state === RESOLVED) {
        nextTick(() => {
          // 成功状态调用 onFulfilled
          try {
            // 为了链式调用，需要获取 onFulfilled 函数执行的返回值，通过 resolve 返回
            const x = onFulfilled(this.value)
            // 通过 resolvePromise 函数对 x 的返回值做处理
            resolvePromise(promise2, x, resolve, reject)
          } catch (error) {
            reject(error)
          }
        })
      }
      if (this.state === REJECTED) {
        // 失败状态调用 onRejected
        nextTick(() => {
          try {
            // 为了链式调用，需要获取 onRejected 函数执行的返回值，通过 resolve 返回
            const x = onRejected(this.reason)
            resolvePromise(promise2, x, resolve, reject)
          } catch (error) {
            reject(error)
          }
        })
      }

      // 当 Promise 状态为等待状态 (pending) 时，将 onFulfilled 和 onRejected 存入对应的回调队列
      if (this.state === PENDING) {
        // 存入 onFulfilled 函数
        this.resolvedCallbacks.push(() => {
          try {
            const x = onFulfilled(this.value)
            // 通过 resolvePromise 函数对 x 的返回值做处理
            resolvePromise(promise2, x, resolve, reject)
          } catch (error) {
            reject(error)
          }
        })
        // 存入 onRejected 函数
        this.rejectedCallbacks.push(() => {
          try {
            const x = onRejected(this.reason)
            resolvePromise(promise2, x, resolve, reject)
          } catch (error) {
            reject(error)
          }
        })
      }
    })

    return promise2
  }
}

Promise.defer = Promise.deferred = function () {
  const dfd = {}
  dfd.promise = new Promise((resolve, reject) => {
    dfd.resolve = resolve
    dfd.reject = reject
  })
  return dfd
}

module.exports = Promise