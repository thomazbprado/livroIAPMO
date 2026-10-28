// Atalhos de navegação entre telas (abrem ou focam uma aba).
import { S, rotuloSetorCurto, rotuloFase } from './core.js';
import { abrirAba } from './nav.js';

export const abrirInicio = () => abrirAba({ tipo: 'inicio', titulo: 'Início', icone: 'home' });
export const abrirAssistente = (dados = {}) => abrirAba({ tipo: 'assistente', titulo: 'Análise guiada', icone: 'compass', dados });
export const abrirCatalogo = (filtro = {}) => {
  const a = abrirAba({ tipo: 'catalogo', titulo: 'Catálogo', icone: 'library' });
  if (a.inst.filtrar && Object.keys(filtro).length) a.inst.filtrar(filtro);
  return a;
};
export const abrirExecucoes = () => abrirAba({ tipo: 'execucoes', titulo: 'Execuções', icone: 'list' });
export const abrirServicos = (sel) => { const a = abrirAba({ tipo: 'servicos', titulo: 'Serviços PMO', icone: 'briefcase' }); if (sel && a.inst.seleciona) a.inst.seleciona(sel); return a; };
export const abrirPlano = (secao) => { const a = abrirAba({ tipo: 'plano', titulo: 'Plano e uso', icone: 'card' }); if (secao && a.inst.vaiPara) a.inst.vaiPara(secao); return a; };
export const abrirApi = () => abrirAba({ tipo: 'api', titulo: 'API e integrações', icone: 'code' });
export const abrirConfig = () => abrirAba({ tipo: 'config', titulo: 'Configurações', icone: 'gear' });
export const abrirAdmin = () => abrirAba({ tipo: 'admin', titulo: 'Administração', icone: 'shield' });
export const abrirAjuda = () => abrirAba({ tipo: 'ajuda', titulo: 'Guia rápido', icone: 'help' });
export function abrirPrompt(id, dados = {}) {
  const p = S.prompts.find((x) => x.id === id) || S.cat?.prompts.find((x) => x.id === id);
  const titulo = p ? p.titulo : 'Prompt';
  return abrirAba({ tipo: 'prompt', id: 'prompt:' + id, titulo: titulo.length > 28 ? titulo.slice(0, 27) + '…' : titulo, icone: 'sparkles', dados: { promptId: id, ...dados } });
}
export function abrirExecucao(id, titulo = 'Execução') {
  return abrirAba({ tipo: 'execucao', id: 'exec:' + id, titulo: titulo.length > 28 ? titulo.slice(0, 27) + '…' : titulo, icone: 'clip', dados: { execId: id } });
}
export const rotuloCelula = (setor, fase) => `${rotuloSetorCurto(setor)} / ${rotuloFase(fase)}`;
