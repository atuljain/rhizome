import Reflux from 'reflux'
import api from 'data/api'

var RegionStore = Reflux.createStore({
  init () {
    this.locations = []
    this.LocationTypes = []

    this.locationsPromise = api.locations(null, null, { 'cache-control': 'max-age=604800, public' })
      .then(data => {
        this.locations = data.objects
        this.trigger({
          locations: this.locations
        })
        return this.locations
      })

    this.LocationTypesPromise = api.location_type(null, null, { 'cache-control': 'max-age=604800, public' })
      .then(data => {
        this.LocationTypes = data.objects
        this.trigger({
          LocationTypes: this.LocationTypes
        })
        return this.LocationTypes
      })
  },

  getInitialState () {
    return {
      locations: this.locations,
      LocationTypes: this.LocationTypes
    }
  },

  // API
  getlocationsPromise () {
    return this.locationsPromise
  },

  getLocationTypesPromise () {
    return this.LocationTypesPromise
  }
})

export default RegionStore
