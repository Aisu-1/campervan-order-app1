import io from 'socket.io-client';
import { API_URL } from './config';

// シングルトンとしてSocketインスタンスを管理
export const socket = io(API_URL);
