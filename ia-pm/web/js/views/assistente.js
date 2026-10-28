import { h, api, S, mount, icon, rotuloSetorCurto, rotuloFase, rotuloDisc } from '../core.js';
import * as go from '../go.js';
import { toast, modal } from '../ui.js';
import { emit } from '../core.js';

const RISCO = { baixo: ['ok', 'Risco de uso baixo'], medio: ['warn', 'Risco de uso médio'], alto: ['bad', 'Risco de uso alto'] };

export default function assistente(tab, el) {
  const raiz = h('div', { class: 'wrap stack' }); el.append(raiz);
  const est = { passo: 1, setor: tab.dados.setor || null, fase: tab.dados.fase || null, disciplina: null };
  const tx = () => S.cat.taxonomia;
  const doSetor = (s) => S.prompts.filter((p) => p.setor === s);

  function cabecalho() {
    const nomes = ['Setor', 'Fase', 'Decisão', 'Abrir'];
    return h('div', { class: 'stepper', role: 'list' }, nomes.map((n, i) => h('div', { class: 'step ' + (est.passo === i + 1 ? 'now' : est.passo > i + 1 ? 'done' : ''), role: 'listitem' },
      h('span', { class: 'n' }, est.passo > i + 1 ? icon('check') : String(i + 1)), n)));
  }
  const voltar = () => h('button', { class: 'btn', type: 'button', onclick: () => { est.passo = Math.max(1, est.passo - 1); desenha(); } }, 'Voltar');

  function passo1() {
    return [h('h2', { text: 'Em que setor está o seu projeto?' }), h('p', { class: 'muted', text: 'O setor define o vocabulário, os riscos e os critérios que o prompt usa.' }),
      h('div', { class: 'grid auto sp12' }, tx().setores.map((s) => {
        const n = doSetor(s.id).length;
        return h('div', { class: 'choice' + (est.setor === s.id ? ' on' : ''), role: 'button', tabindex: '0', onclick: () => { est.setor = s.id; est.fase = null; est.passo = 2; desenha(); } },
          h('div', null, h('div', { class: 'ttl', text: s.nome }), h('div', { class: 'sub', text: s.descricao }), h('div', { class: 'row sp8' }, h('span', { class: 'chip ' + (n ? 'acc' : ''), text: n ? `${n} prompt(s)` : 'ainda sem prompts' }))));
      }))];
  }
  function passo2() {
    const s = tx().setores.find((x) => x.id === est.setor);
    return [h('h2', { text: 'Em que fase está o projeto?' }), h('p', { class: 'muted', text: `Setor escolhido: ${s.nome}. A fase muda a finalidade do prompt e os dados que ele pede.` }),
      h('div', { class: 'grid auto sp12' }, tx().fases.map((f) => {
        const n = doSetor(est.setor).filter((p) => p.fase === f.id).length;
        return h('div', { class: 'choice' + (est.fase === f.id ? ' on' : ''), role: 'button', tabindex: '0', onclick: () => { est.fase = f.id; est.passo = 3; desenha(); } },
          h('div', null, h('div', { class: 'ttl', text: f.nome }), h('div', { class: 'sub', text: f.descricao }), h('div', { class: 'row sp8' }, h('span', { class: 'chip ' + (n ? 'acc' : ''), text: n ? `${n} prompt(s)` : 'sem prompt para este setor' }))));
      })), h('div', { class: 'row sp16' }, voltar())];
  }
  function passo3() {
    const lista = doSetor(est.setor).filter((p) => p.fase === est.fase);
    const alvo = est.disciplina ? lista.filter((p) => p.disciplinas.includes(est.disciplina)) : lista;
    const blocos = [h('h2', { text: 'Qual decisão ou entrega você precisa apoiar?' }),
      h('p', { class: 'muted', text: `${rotuloSetorCurto(est.setor)} em ${rotuloFase(est.fase)}.` })];
    if (lista.length > 1) {
      blocos.push(h('div', { class: 'row wrap sp8' }, h('span', { class: 'faint', text: 'Focar em uma disciplina:' }),
        h('button', { class: 'chip' + (!est.disciplina ? ' acc' : ''), type: 'button', onclick: () => { est.disciplina = null; desenha(); }, text: 'Todas' }),
        ...tx().disciplinas.filter((d) => lista.some((p) => p.disciplinas.includes(d.id))).map((d) => h('button', { class: 'chip' + (est.disciplina === d.id ? ' acc' : ''), type: 'button', onclick: () => { est.disciplina = d.id; desenha(); }, text: d.nome }))));
    }
    if (alvo.length) {
      blocos.push(h('div', { class: 'grid auto sp12' }, alvo.map((p) => h('div', { class: 'card pcard' + (p.acesso ? '' : ' locked'), role: 'button', tabindex: '0', onclick: () => { est.passo = 4; est.prompt = p; desenha(); } },
        h('div', { class: 'ttl', text: p.titulo }), h('div', { class: 'muted', text: p.decisao_apoiada }),
        h('div', { class: 'row wrap' }, p.disciplinas.map((d) => h('span', { class: 'chip', text: rotuloDisc(d) })), h('span', { class: 'chip ' + RISCO[p.classificacao_risco_uso][0], text: RISCO[p.classificacao_risco_uso][1] }), p.acesso ? null : h('span', { class: 'chip warn' }, icon('lock'), 'Nível Leitor'))))));
    } else {
      const vizinhos = S.prompts.filter((p) => p.setor === est.setor || p.fase === est.fase).slice(0, 6);
      blocos.push(h('div', { class: 'callout warn sp12' }, icon('info'), h('div', null, h('b', { text: 'Ainda não temos um prompt para esta combinação. ' }), 'Você pode pedi-lo (isso ajuda a priorizar o catálogo) ou usar um prompt próximo.')));
      blocos.push(h('div', { class: 'row sp12' }, h('button', { class: 'btn primary', type: 'button', onclick: () => pedirPrompt(est.setor, est.fase), text: 'Pedir este prompt' })));
      if (vizinhos.length) blocos.push(h('h3', { class: 'sp16', text: 'Prompts próximos' }), h('div', { class: 'grid auto sp8' }, vizinhos.map((p) => h('div', { class: 'card pcard', role: 'button', tabindex: '0', onclick: () => go.abrirPrompt(p.id) }, h('div', { class: 'ttl', text: p.titulo }), h('div', { class: 'muted', text: `${rotuloSetorCurto(p.setor)} / ${rotuloFase(p.fase)}` })))));
    }
    blocos.push(h('div', { class: 'row sp16' }, voltar()));
    return blocos;
  }
  function passo4() {
    const p = est.prompt;
    return [h('h2', { text: 'Tudo certo. Vamos preencher.' }),
      h('div', { class: 'card sp12' }, h('h3', { text: p.titulo }), h('p', { class: 'muted', text: p.resumo }),
        h('div', { class: 'callout info' }, icon('info'), h('div', null, h('b', { text: 'O que vai acontecer: ' }), '(1) você preenche o formulário com os dados do projeto; (2) o portal calcula os números por código; (3) a IA redige a análise; (4) você valida e exporta. Dica: use "Exemplo do livro" para ver um caso completo.')),
        !p.acesso ? h('div', { class: 'callout warn sp8' }, icon('lock'), h('div', { text: 'Este prompt faz parte do nível Leitor. Você pode ver o formulário, mas precisará resgatar o código do livro ou assinar para executar.' })) : null),
      h('div', { class: 'row sp16' }, voltar(), h('button', { class: 'btn primary lg', type: 'button', onclick: () => go.abrirPrompt(p.id), text: 'Abrir o formulário' }))];
  }
  function pedirPrompt(setor, fase) {
    const t = h('textarea', { class: 'inp', rows: 4, placeholder: 'Que decisão ou entrega você gostaria de apoiar? Quais dados costuma ter?' });
    modal({ titulo: 'Pedir um prompt', corpo: h('div', { class: 'stack' }, h('p', { text: `${rotuloSetorCurto(setor)} em ${rotuloFase(fase)}` }), t),
      botoes: [{ label: 'Cancelar' }, { label: 'Enviar pedido', primary: true, onclick: async () => {
        if (t.value.trim().length < 10) { toast('Descreva em pelo menos 10 caracteres.', 'warn'); return false; }
        try { await api('/v1/sugestoes', { method: 'POST', body: { setor, fase, descricao: t.value } }); toast('Pedido registrado. Obrigado!', 'ok'); } catch (e) { toast(e.message, 'bad'); return false; }
      } }] });
  }
  function desenha() {
    mount(raiz, h('div', null, h('h1', { text: 'Análise guiada' }), h('p', { class: 'muted', text: 'Responda em quatro passos e abra o prompt certo para o seu projeto.' })), cabecalho(),
      h('div', { class: 'card' }, est.passo === 1 ? passo1() : est.passo === 2 ? passo2() : est.passo === 3 ? passo3() : passo4()));
    emit('guia:atualizar');
  }
  desenha();
  return {
    guia: () => ({ titulo: 'Análise guiada', intro: 'Um passo de cada vez. Você pode voltar quando quiser.',
      passos: ['Setor do projeto', 'Fase do ciclo de vida', 'Decisão que quer apoiar', 'Abrir o formulário'].map((t, i) => ({ t, d: ['Define vocabulário e riscos.', 'Define finalidade e dados.', 'Escolha entre os prompts disponíveis.', 'Preencha, calcule, execute e valide.'][i], estado: est.passo > i + 1 ? 'done' : est.passo === i + 1 ? 'now' : '' })),
      dicas: ['Sem prompt para a sua combinação? Peça: o catálogo cresce com a demanda.'] }),
    filtrar: (f) => { if (f.setor) est.setor = f.setor; desenha(); },
  };
}
