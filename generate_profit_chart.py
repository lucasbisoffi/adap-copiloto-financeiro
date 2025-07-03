import sys
import json
import os
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import cloudinary
import cloudinary.uploader

# Função para imprimir mensagens de erro no stderr e sair (sem alterações).
def fail(message):
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)

# Configuração do Cloudinary (sem alterações).
try:
    cloudinary.config(
        cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key=os.getenv("CLOUDINARY_API_KEY"),
        api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    )
    if not all([os.getenv("CLOUDINARY_CLOUD_NAME"), os.getenv("CLOUDINARY_API_KEY"), os.getenv("CLOUDINARY_API_SECRET")]):
        raise ValueError("Credenciais do Cloudinary nao estao totalmente configuradas.")
except Exception as e:
    fail(f"Erro na configuracao do Cloudinary: {e}")

# ==============================================================================
# FUNÇÃO DO GRÁFICO TOTALMENTE MELHORADA
# ==============================================================================
def create_profit_chart(data, image_path):
    """
    Gera um gráfico de linhas aprimorado, comparando ganhos, gastos e lucro líquido diários.
    """
    if not data:
        fail("Dados vazios recebidos. Nao e possivel gerar o grafico.")
        return

    # 1. Preparação robusta dos dados com Pandas
    df = pd.DataFrame(data)
    df['date'] = pd.to_datetime(df['date'])
    df.set_index('date', inplace=True)

    # Garante que as colunas 'income' e 'expense' existam, preenchendo com 0 se não existirem.
    if 'income' not in df.columns:
        df['income'] = 0
    if 'expense' not in df.columns:
        df['expense'] = 0
    df.fillna(0, inplace=True)

    # Cria um range com todos os dias do período para não haver "buracos" no gráfico
    full_date_range = pd.date_range(start=df.index.min(), end=df.index.max(), freq='D')
    df = df.reindex(full_date_range, fill_value=0)
    
    # Calcula a coluna mais importante: o lucro líquido
    df['profit'] = df['income'] - df['expense']
    df['formatted_date'] = df.index.strftime('%d/%m')

    # 2. Criação do Gráfico com Estilo Aprimorado
    plt.style.use('seaborn-v0_8-whitegrid')
    fig, ax = plt.subplots(figsize=(12, 7))

    # Plotando Ganhos e Gastos como linhas
    ax.plot(df.index, df['income'], label='Ganhos', color='#2ecc71', marker='o', linestyle='-', linewidth=2.5)
    ax.plot(df.index, df['expense'], label='Gastos', color='#e74c3c', marker='o', linestyle='-', linewidth=2.5)

    # 3. Visualização do Lucro Líquido (a grande melhoria!)
    # Preenche a área de lucro em verde e a de prejuízo em vermelho
    ax.fill_between(df.index, df['profit'], where=df['profit'] >= 0, facecolor='#2ecc71', alpha=0.3, interpolate=True, label='Lucro')
    ax.fill_between(df.index, df['profit'], where=df['profit'] < 0, facecolor='#e74c3c', alpha=0.3, interpolate=True, label='Prejuízo')

    # Adiciona uma linha de referência em zero
    ax.axhline(0, color='grey', linestyle='--', linewidth=1)

    # 4. Melhorias na Formatação e Estética
    ax.set_title('Resumo de Ganhos, Gastos e Lucro Diário', fontsize=18, fontweight='bold', pad=20)
    ax.set_ylabel('Valor (R$)', fontsize=14)
    ax.set_xlabel('Data', fontsize=14)
    
    # Formata o eixo Y para mostrar a moeda corretamente
    formatter = mticker.FormatStrFormatter('R$ %.2f')
    ax.yaxis.set_major_formatter(formatter)

    # Ajusta os ticks do eixo X para mostrar as datas formatadas
    ax.set_xticks(df.index)
    ax.set_xticklabels(df['formatted_date'], rotation=30, ha="right")
    
    # Organiza a legenda
    handles, labels = ax.get_legend_handles_labels()
    # Ordem desejada: Ganhos, Gastos, Lucro, Prejuízo
    order = [labels.index('Ganhos'), labels.index('Gastos'), labels.index('Lucro'), labels.index('Prejuízo')]
    ax.legend([handles[idx] for idx in order], [labels[idx] for idx in order], fontsize=12)

    fig.tight_layout()
    plt.savefig(image_path, dpi=100, bbox_inches='tight')
    plt.close()

# Função de upload para o Cloudinary (sem alterações).
def upload_to_cloudinary(image_path):
    try:
        upload_response = cloudinary.uploader.upload(image_path, folder="adap_reports")
        return upload_response.get('secure_url')
    except Exception as e:
        fail(f"Erro no upload para Cloudinary: {e}")
        return None

# Bloco principal de execução (sem alterações na lógica, apenas nos comentários).
if __name__ == "__main__":
    if len(sys.argv) != 3:
        fail("Uso incorreto. Esperado: python generate_profit_chart.py <json_in> <image_out>")

    json_path = sys.argv[1]
    image_path = sys.argv[2]

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            report_data = json.load(f)

        create_profit_chart(report_data, image_path)
        
        image_url = upload_to_cloudinary(image_path)

        if image_url:
            # A única saída em caso de sucesso é a URL da imagem.
            print(image_url)
        else:
            fail("Nao foi possivel obter a URL da imagem apos o upload.")

    except FileNotFoundError:
        fail(f"Arquivo JSON nao encontrado em {json_path}")
    except json.JSONDecodeError:
        fail(f"JSON invalido em {json_path}")
    except Exception as e:
        fail(f"Um erro inesperado ocorreu: {e}")
    finally:
        # Limpeza dos arquivos temporários.
        if os.path.exists(json_path):
            os.remove(json_path)
        if os.path.exists(image_path):
            os.remove(image_path)