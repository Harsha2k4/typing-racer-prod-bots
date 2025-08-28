import axios from 'axios'

const BASE = import.meta.env.VITE_API


export const api = {
  async get(path, token=null, params={}){
    return axios.get(BASE + path, { params, headers: token ? { Authorization: 'Bearer ' + token } : {} })
  },
  async post(path, data=null, { params={}, headers={}, token } = {}){
    return axios.post(BASE + path, data, { params, headers: token ? { ...headers, Authorization: 'Bearer ' + token } : headers })
  }
}
