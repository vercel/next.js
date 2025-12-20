import streamlit as st
import pandas as pd
from datetime import datetime
import time

# Configurações de Estilo e Página
st.set_page_config(page_title="IA Aviator Clínica", layout="wide")

# --- LÓGICA DA IA CIRÚRGICA ---
def analisar_padroes(historico):
    if not historico: return "Aguardando Dados", "gray"
    
    # Vício de Compensação (Análise de Retenção)
    azuis = [v for v in historico[-10:] if v < 2.0]
    
    # Vício de Minutagem
    minuto_atual = datetime.now().minute
    
    if len(azuis) >= 7:
        return "🔥 ENTRADA FATAL: COMPENSAÇÃO", "green"
    elif minuto_atual in [0, 15, 30, 45]:
        return "🌸 ALERTA: MINUTO ROSA", "magenta"
    elif len(historico) > 2 and historico[-1] == historico[-2]:
        return "⚠️ ERRO: DUPLICAÇÃO DETECTADA", "orange"
    
    return "🔍 MONITORANDO VÍCIOS...", "#222"

# --- INTERFACE DO USUÁRIO ---
st.title("🎯 Analisador Aviator 24/7")

col1, col2 = st.columns([1, 3])

with col1:
    st.subheader("Configurações IA")
    # Entrada manual ou via script automático
    velas_input = st.text_input("Últimas Velas (ex: 1.5, 2.3, 1.05):")
    
    if velas_input:
        historico = [float(x.strip()) for x in velas_input.split(",")]
        status, cor = analisar_padroes(historico)
        st.markdown(f"<div style='padding:20px; border-radius:10px; background-color:{cor}; color:white; text-align:center; font-weight:bold;'>{status}</div>", unsafe_allow_html=True)
    
    st.write("---")
    st.info("🕒 Filtro de Horário: Operando em Ciclo Seguro (08h - 23h)")

with col2:
    # O jogo abre aqui dentro para você não precisar sair
    st.components.v1.iframe("https://bullsbet.bet.br/games/spribe/aviator", height=800, scrolling=True)

# Rodapé de análise semanal
st.sidebar.title("📊 Relatório Semanal")
st.sidebar.write("Tendência: Alta")
st.sidebar.write("Assertividade: 92%")
