const debounce = require('debounce')
const idbKeyval = require('idb-keyval')

module.exports = function (configuration) {
  configuration = Object.assign({
    storageKey: 'gw2api-cache',
    gcTick: 5 * 60 * 1000,
    persistDebounce: 3 * 1000,
    storageEngine: idbKeyval
  }, configuration)

  let _storage = {}
  const storageEngine = configuration.storageEngine
  const storageKey = configuration.storageKey
  const persist = debounce(_persist, configuration.persistDebounce)

  function get (key) {
    return hydration.then(() => _get(key))
  }

  function set (key, value, expiry) {
    _set(key, value, expiry)
    return Promise.resolve(true)
  }

  function mget (keys) {
    return hydration.then(() => keys.map(key => _get(key)))
  }

  function mset (values) {
    values.map(value => {
      _set(value[0], value[1], value[2])
    })

    return Promise.resolve(true)
  }

  function _get (key) {
    let value = _storage[key]
    let now = (new Date()).getTime()
    return value && value.expiry > now ? value.value : null
  }

  function _set (key, value, expiry) {
    _storage[key] = { value, expiry: (new Date()).getTime() + expiry * 1000 }
    persist()
  }

  function _persist () {
    hydration
      .then(() => storageEngine.set(storageKey, _storage))
      .catch(/* istanbul ignore next */ err => {
        console.warn('Failed persisting cache', err)
      })
  }

  function hydrate () {
    return storageEngine.get(storageKey)
      .then(value => {
        if (!value) {
          return
        }

        Object.keys(value).forEach(key => {
          if (!(key in _storage)) {
            _storage[key] = value[key]
          }
        })
      })
      .catch(/* istanbul ignore next */ err => {
        console.warn('Failed hydrating cache', err)
      })
  }

  function flush () {
    return hydration.then(() => {
      _storage = {}
      const deleteCallback = storageEngine.del || storageEngine.delete
      deleteCallback(storageKey)
      return true
    })
  }

  function _getStorage () {
    return _storage
  }

  function garbageCollection () {
    const now = (new Date()).getTime()
    const keys = Object.keys(_storage)

    for (let i = 0; i !== keys.length; i++) {
      if (_storage[keys[i]].expiry < now) {
        delete _storage[keys[i]]
      }
    }

    persist()
  }

  setInterval(garbageCollection, configuration.gcTick)
  const hydration = hydrate()
  hydration.then(garbageCollection)

  return { get, set, mget, mset, flush, _getStorage }
}
