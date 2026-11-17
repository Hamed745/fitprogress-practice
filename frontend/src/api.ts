import type { Exercise, Workout, WorkoutDraft, Template, TemplateDraft } from './types';

async function request<T>(url:string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response=await fetch(url,{...options,headers:{...(options?.body===undefined?{}:{'Content-Type':'application/json'}),...options?.headers}}); }
  catch { throw new Error('Нет подключения к серверу API. Запустите backend.'); }
  if (!response.ok) {
    const error = await response.json().catch(()=>({error:response.statusText}));
    throw new Error(error.error || `Ошибка HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
const json = (data:unknown) => ({method:'POST',body:JSON.stringify(data)});
export const api = {
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
