import sys
import json
import os
import matplotlib.pyplot as plt
import cloudinary
import cloudinary.uploader

# Função para imprimir mensagens de erro no stderr e sair (sem alterações)
def fail(message):
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)

# Configuração do Cloudinary (sem alterações)
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
# FUNÇÃO DO GRÁFICO ATUALIZADA COM NOVAS CORES E INFORMAÇÕES
# ==============================================================================
def create_income_platform_chart(data, image_path):
    if not data:
        fail("Dados vazios recebidos. Nao e possivel gerar o grafico.")
        return

    labels = [item['_id'] for item in data]
    sizes = [item['total'] for item in data]
    total_income = sum(sizes)

    # ALTERAÇÃO 1: Paleta de cores pastel
    pastel_colors = ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E0BBE4', '#D7BDE2']

    fig, ax = plt.subplots(figsize=(11, 8), subplot_kw=dict(aspect="equal"))
    
    wedges, texts, autotexts = ax.pie(
        sizes, 
        wedgeprops=dict(width=0.45, edgecolor='w'),
        startangle=90,
        colors=pastel_colors, # Usando a nova paleta
        autopct=lambda p: '{:.1f}%'.format(p) if p > 5 else '',
        pctdistance=0.78
    )

    plt.setp(autotexts, size=12, weight="bold", color="#404040")

    ax.text(0, 0, f'Total\nR$ {total_income:,.2f}'.replace(",", "X").replace(".", ",").replace("X", "."),
            ha='center', va='center', fontsize=24, weight="bold", color='#333')

    ax.set_title("Ganhos por Plataforma (Mês Atual)", fontsize=18, weight="bold", pad=20)
    
    # ALTERAÇÃO 2: Legenda mais informativa
    legend_labels = []
    for item in data:
        platform_name = item['_id']
        total_earnings = item['total']
        run_count = item['count']
        total_distance = item.get('totalDistance', 0) # .get() para evitar erro se a chave não existir
        
        # Cálculo seguro de R$/km
        if total_distance > 0:
            r_per_km = total_earnings / total_distance
            r_per_km_str = f"R$ {r_per_km:.2f}/km"
        else:
            r_per_km_str = "N/A"
            
        # Formato de moeda para PT-BR
        formatted_earnings = f"R$ {total_earnings:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        
        # Monta a string final da legenda
        label_text = f"{platform_name}: {formatted_earnings}\n({run_count} corridas | {r_per_km_str})"
        legend_labels.append(label_text)

    ax.legend(wedges, legend_labels,
              title="Plataformas",
              loc="center left",
              bbox_to_anchor=(1.05, 0, 0.5, 1), # Afasta um pouco mais a legenda
              fontsize=11) # Fonte um pouco menor para caber tudo

    plt.tight_layout(rect=[0, 0, 0.8, 1])

    plt.savefig(image_path, dpi=100, bbox_inches='tight')
    plt.close()

# Função de upload para o Cloudinary (sem alterações)
def upload_to_cloudinary(image_path):
    try:
        public_id = os.path.splitext(os.path.basename(image_path))[0]
        upload_response = cloudinary.uploader.upload(
            image_path, 
            folder="adap_reports",
            public_id=public_id,
            overwrite=True
        )
        return upload_response.get('secure_url')
    except Exception as e:
        fail(f"Erro no upload para Cloudinary: {e}")
        return None

# Bloco principal de execução (sem alterações)
if __name__ == "__main__":
    if len(sys.argv) != 4:
        fail("Uso incorreto. Esperado: python script.py <json_string> <user_id> <temp_dir>")

    report_data_json = sys.argv[1]
    user_id = sys.argv[2]
    temp_dir = sys.argv[3]
    
    image_filename = f"platform_chart_{user_id}.png"
    image_path = os.path.join(temp_dir, image_filename)

    try:
        report_data = json.loads(report_data_json)
        
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)

        create_income_platform_chart(report_data, image_path)
        
        image_url = upload_to_cloudinary(image_path)

        if image_url:
            print(image_url)
        else:
            fail("Nao foi possivel obter a URL da imagem apos o upload.")

    except json.JSONDecodeError:
        fail("JSON invalido recebido.")
    except Exception as e:
        fail(f"Um erro inesperado ocorreu: {e}")
    finally:
        if os.path.exists(image_path):
            os.remove(image_path)