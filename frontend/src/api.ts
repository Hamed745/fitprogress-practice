import type { Exercise, Workout, WorkoutDraft, Template, TemplateDraft } from './types';

export type Account = { id:number; name:string; email:string };
export type AuthDraft = { email:string; password:string };

async function request<T>(url:string, options?:RequestInit):Promise<T> {
  let response:Response;
  try {
    response=await fetch(url,{
      credentials:'same-origin',
      ...options,
      headers:{...(options?.body===undefined?{}:{'Content-Type':'application/json'}),...options?.headers},
    });
  }catch{throw new Error('Нет подключения к серверу API. Запустите backend.');}
  if(!response.ok){
    const data=await response.json().catch(()=>({error:response.statusText}));
    const problem=new Error(data.error||`Ошибка HTTP ${response.status}`);
    if(response.status===401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('fitprogress:session-expired'));
    throw problem;
  }
  if(response.status===204)return undefined as T;
  return response.json() as Promise<T>;
}
const json=(data:unknown)=>({method:'POST',body:JSON.stringify(data)});
export const api={
  me:()=>request<Account>('/api/auth/me'),
  register:(data:AuthDraft&{name:string})=>request<Account>('/api/auth/register',json(data)),
  login:(data:AuthDraft)=>request<Account>('/api/auth/login',json(data)),
  logout:()=>request<{ok:boolean}>('/api/auth/logout',{method:'POST'}),
  exercises:()=>request<Exercise[]>('/api/exercises'),
  addExercise:(data:Omit<Exercise,'id'>)=>request<Exercise>('/api/exercises',json(data)),
  workouts:()=>request<Workout[]>('/api/workouts'),
  addWorkout:(data:WorkoutDraft)=>request<{id:number}>('/api/workouts',json(data)),
  updateWorkout:(id:number,data:WorkoutDraft)=>request<{id:number}>(`/api/workouts/${id}`,{method:'PUT',body:JSON.stringify(data)}),
  deleteWorkout:(id:number)=>request<void>(`/api/workouts/${id}`,{method:'DELETE'}),
  templates:()=>request<Template[]>('/api/templates'),
  addTemplate:(data:TemplateDraft)=>request<{id:number}>('/api/templates',json(data)),
  deleteTemplate:(id:number)=>request<void>(`/api/templates/${id}`,{method:'DELETE'}),
};
