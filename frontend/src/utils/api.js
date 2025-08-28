import axios from 'axios'

const BASE = import.meta.env.VITE_API || 'http://127.0.0.1:8000'
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const api = {
  async get(path, token=null, params={}){
    return axios.get(BASE + path, { params, headers: token ? { Authorization: 'Bearer ' + token } : {} })
  },
  async post(path, data=null, { params={}, headers={}, token } = {}){
    return axios.post(BASE + path, data, { params, headers: token ? { ...headers, Authorization: 'Bearer ' + token } : headers })
  }
}
