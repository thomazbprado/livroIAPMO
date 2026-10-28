from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import billing, exportacao, runner
from ..catalog import catalogo
from ..db import get_db
from ..deps import Ctx, contexto
from ..models import Execution, User, Validation
from ..schemas import ValidacaoIn

router = APIRouter(prefix="/v1", tags=["execuções"])


def exec_dict(ex: Execution, completo: bool = False, usuario: str | None = None) -> dict:
    ultima = ex.validacoes[-1] if ex.validacoes else None
    base = {
        "id": ex.id, "prompt_id": ex.prompt_id, "prompt_versao": ex.prompt_versao, "prompt_titulo": ex.prompt_titulo,
        "status": ex.status, "etapa": ex.etapa, "fonte_ia": ex.fonte_ia, "nivel_modelo": ex.nivel_modelo, "modelo": ex.modelo,
        "classificacao_dados": ex.classificacao_dados, "finalidade": ex.finalidade, "projeto_ref": ex.projeto_ref,
        "canal": ex.canal, "tokens_in": ex.tokens_in, "tokens_out": ex.tokens_out, "custo_usd": ex.custo_usd,
        "creditos_cobrados": ex.creditos_cobrados, "erro": ex.erro,
        "criado_em": ex.criado_em.isoformat(), "concluido_em": ex.concluido_em.isoformat() if ex.concluido_em else None,
        "validacao": ultima.decisao if ultima else None, "usuario": usuario,
        "divergencias": sum(1 for c in (ex.conferencia or []) if c["status"] == "diverge"),
    }
    if completo:
        base.update({
            "variaveis": ex.variaveis, "verificacoes": ex.verificacoes, "saida": ex.saida, "conferencia": ex.conferencia,
            "prompt_renderizado": ex.prompt_renderizado,
            "validacoes": [
                {"id": v.id, "decisao": v.decisao, "validador_nome": v.validador_nome, "validador_papel": v.validador_papel,
                 "checklist": v.checklist, "justificativa": v.justificativa, "instancia_decisoria": v.instancia_decisoria,
                 "condicionantes": v.condicionantes, "criado_em": v.criado_em.isoformat()}
                for v in ex.validacoes
            ],
        })
        p = catalogo().get(ex.prompt_id)
        base["checklist_sugerido"] = (p or {}).get("validacao_humana", {}).get("checklist", [])
        base["papeis_sugeridos"] = (p or {}).get("validacao_humana", {}).get("papeis_sugeridos", [])
    return base


def _carrega(db: Session, ctx: Ctx, exec_id: str) -> Execution:
    ex = db.get(Execution, exec_id)
    if ex is None or ex.org_id != ctx.org.id or (ctx.user.papel != "admin" and ex.user_id != ctx.user.id):
        raise HTTPException(404, "Execução não encontrada.")
    return ex


@router.get("/execucoes")
def lista(ctx: Ctx = Depends(contexto), db: Session = Depends(get_db), limite: int = Query(30, ge=1, le=100),
          deslocamento: int = Query(0, ge=0), status: str | None = None, prompt_id: str | None = None,
          q: str | None = Query(None, max_length=100)):
    cond = [Execution.org_id == ctx.org.id]
    if ctx.user.papel != "admin":
        cond.append(Execution.user_id == ctx.user.id)
    if status:
        cond.append(Execution.status == status)
    if prompt_id:
        cond.append(Execution.prompt_id == prompt_id)
    if q:
        like = f"%{q.strip()}%"
        cond.append(or_(Execution.prompt_titulo.ilike(like), Execution.projeto_ref.ilike(like), Execution.finalidade.ilike(like)))
    total = db.scalar(select(func.count(Execution.id)).where(*cond)) or 0
    rows = db.scalars(select(Execution).where(*cond).order_by(Execution.criado_em.desc()).limit(limite).offset(deslocamento)).all()
    nomes = {u.id: u.nome for u in db.scalars(select(User).where(User.org_id == ctx.org.id)).all()}
    return {"total": total, "execucoes": [exec_dict(e, usuario=nomes.get(e.user_id)) for e in rows]}


@router.get("/execucoes/{exec_id}")
def detalhe(exec_id: str, ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    ex = _carrega(db, ctx, exec_id)
    u = db.get(User, ex.user_id)
    return exec_dict(ex, completo=True, usuario=u.nome if u else None)


@router.post("/execucoes/{exec_id}/validacao", status_code=201)
def valida(exec_id: str, body: ValidacaoIn, ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    ex = _carrega(db, ctx, exec_id)
    try:
        runner.registra_validacao(db, ctx, ex, catalogo().get(ex.prompt_id), body.model_dump())
    except billing.ErroNegocio as e:
        raise HTTPException(e.status, {"codigo": e.codigo, "mensagem": e.mensagem}) from e
    db.commit()
    db.refresh(ex)
    u = db.get(User, ex.user_id)
    return exec_dict(ex, completo=True, usuario=u.nome if u else None)


@router.get("/execucoes/{exec_id}/auditoria")
def auditoria(exec_id: str, ctx: Ctx = Depends(contexto), db: Session = Depends(get_db)):
    if not billing.plano_efetivo(db, ctx.org)["exportar_auditoria"]:
        raise HTTPException(403, "A exportação do registro de auditoria está disponível a partir do nível Leitor.")
    ex = _carrega(db, ctx, exec_id)
    u = db.get(User, ex.user_id)
    return exportacao.registro_auditoria(ex, u, catalogo().get(ex.prompt_id))


@router.get("/execucoes/{exec_id}/exportar")
def exportar(exec_id: str, formato: str = Query("html", pattern="^(html|md)$"), ctx: Ctx = Depends(contexto),
             db: Session = Depends(get_db)):
    ex = _carrega(db, ctx, exec_id)
    if ex.status != "concluida":
        raise HTTPException(409, "A execução ainda não foi concluída.")
    u = db.get(User, ex.user_id)
    if formato == "md":
        return Response(exportacao.para_markdown(ex), media_type="text/markdown; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="iapm-{ex.id[:8]}.md"'})
    return Response(exportacao.para_html(ex, u), media_type="text/html; charset=utf-8")
