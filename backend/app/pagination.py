from fastapi import HTTPException
from sqlalchemy import and_, or_, select


def page(
    session,
    statement,
    model,
    id_column,
    time_column,
    before,
    limit,
    response,
    complaint_id=None,
    principal_id=None,
):
    if before is not None:
        columns = [id_column, time_column]
        if complaint_id is not None:
            columns.append(model.complaint_id)
        if principal_id is not None:
            columns.append(model.principal_id)
        anchor = session.execute(select(*columns).where(id_column == str(before))).first()
        if (
            anchor is None
            or (principal_id is not None and anchor.principal_id != principal_id)
            or (complaint_id is not None and anchor.complaint_id != str(complaint_id))
        ):
            raise HTTPException(400, "Cursor does not exist within these filters.")
        when = getattr(anchor, time_column.key)
        identity = getattr(anchor, id_column.key)
        statement = statement.where(
            or_(time_column < when, and_(time_column == when, id_column < identity))
        )
    rows = session.execute(
        statement.order_by(time_column.desc(), id_column.desc()).limit(limit + 1)
    ).all()
    if len(rows) > limit:
        last = rows[limit - 1]
        value = (
            last._mapping[id_column.key]
            if id_column.key in last._mapping
            else getattr(last[0], id_column.key)
        )
        response.headers["X-Next-Cursor"] = str(value)
    return rows[:limit]
